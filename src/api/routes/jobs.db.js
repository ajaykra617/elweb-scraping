// src/api/routes/jobs.db.js
import express from "express";
import Job from "../models/Job.js";
import Script from "../models/Script.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import queue from "../../queue/queue.js";
import csvParser from "csv-parser";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { REDIS_URL, QUEUE_PREFIX } from "../../config/env.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ dest: "/tmp" });

// Secure Bull queue (uses configured prefix)
const bulkQueue = new Queue("batch-row", {
  connection: new IORedis(REDIS_URL, { maxRetriesPerRequest: null }),
  prefix: QUEUE_PREFIX,
});

// Utility to move uploaded file robustly (handles EXDEV)
function moveFileFallback(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

/* ============================================================
   CREATE BULK (protected)
   ============================================================ */
router.post("/create-bulk", requireAuth, upload.single("inputFile"), async (req, res) => {
  try {
    const userId = req.user.id;
    const { script_id } = req.body;
    const CHUNK = Number(req.body.chunkSize) || 1000;

    if (!req.file) return res.status(400).json({ error: "inputFile is required" });
    if (!script_id) return res.status(400).json({ error: "script_id is required" });

    // Validate script belongs to user
    const script = await Script.findOne({ where: { id: script_id, userId } });
    if (!script) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(404).json({ error: "Invalid script_id (not owned)" });
    }

    // Create parent job
    const parent = await Job.create({
      userId,
      job_type: "batch",
      script_id,
      script_path: script.file_path,
      input_file_path: null,
      totalItems: 0,
      processedRows: 0,
      successCount: 0,
      failedCount: 0,
      status: "queued",
    });

    // Create job uploads folder
    const jobFolder = `/data/uploads/job_${parent.id}`;
    if (!fs.existsSync(jobFolder)) fs.mkdirSync(jobFolder, { recursive: true });

    /* ---------------------------------------
       FIX MOVED HERE
       Compute priority BEFORE moving the file
    ----------------------------------------*/
    let priorityValue = 5;
    try {
      const stats = fs.statSync(req.file.path);
      priorityValue = stats.size < 1_000_000 ? 1 : 5;
    } catch (e) {
      console.warn("WARN: could not stat uploaded file:", e.message);
    }

    // Now move uploaded file
    const destPath = path.join(jobFolder, `input_${Date.now()}.csv`);
    moveFileFallback(req.file.path, destPath);

    parent.input_file_path = destPath;
    await parent.save();

    // Stream CSV and enqueue rows
    let total = 0;
    let buffer = [];
    let rowIndex = 0;
    let firstRow = true;

    const stream = fs.createReadStream(destPath).pipe(
      csvParser({
        skip_empty_lines: true,
        separator: ",",
        headers: true,
        mapHeaders: ({ header }) =>
          header?.trim().replace(/^\uFEFF/, "").replace(/\s+/g, "_").toLowerCase(),
      })
    );

    stream.on("data", (row) => {
      if (firstRow) {
        firstRow = false;
        if (Object.values(row).every(v => !v || String(v).trim() === "")) return;
        return;
      }

      if (!Object.values(row).some((v) => v && String(v).trim() !== "")) return;

      rowIndex++;
      total++;

      buffer.push({
        name: "row-task",
        data: {
          parentJobId: parent.id,
          rowIndex,
          rowData: row,
          script_path: script.file_path,
        },
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: true,
          priority: priorityValue,
        },
      });

      if (buffer.length >= CHUNK) {
        bulkQueue.addBulk(buffer).catch(console.error);
        buffer = [];
      }
    });

    stream.on("end", async () => {
      if (buffer.length > 0) {
        await bulkQueue.addBulk(buffer).catch(console.error);
      }

      await parent.update({ totalItems: total, status: "queued" });

      console.log(`✅ Bulk enqueue complete: job=${parent.id}, rows=${total}, priority=${priorityValue}`);

      return res.json({ success: true, jobId: parent.id, totalRows: total, priority: priorityValue });
    });

    stream.on("error", async (err) => {
      console.error("CSV parse error", err);
      await parent.update({ status: "failed" }).catch(() => {});
      return res.status(500).json({ error: "CSV parse failed" });
    });

  } catch (err) {
    console.error("create-bulk error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});


/* ============================================================
   (Optional) Legacy single create (protected)
   ============================================================ */
router.post("/create", requireAuth, upload.single("inputFile"), async (req, res) => {
  try {
    const userId = req.user.id;
    const { script_id, concurrency = 1 } = req.body;

    if (!req.file) return res.status(400).json({ error: "inputFile is required" });

    const script = await Script.findOne({ where: { id: script_id, userId } });
    if (!script) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(404).json({ error: "Invalid script_id (not owned)" });
    }

    const job = await Job.create({
      userId,
      job_type: "batch",
      status: "queued",
      script_id,
      concurrency,
      input_file_path: null,
    });

    const jobFolder = `/data/uploads/job_${job.id}`;
    if (!fs.existsSync(jobFolder)) fs.mkdirSync(jobFolder, { recursive: true });

    const destPath = path.join(jobFolder, `input_${Date.now()}.csv`);
    moveFileFallback(req.file.path, destPath);

    job.input_file_path = destPath;
    await job.save();

    await queue.add("job", {
      jobId: job.id,
      input_file_path: destPath,
      script_path: script.file_path,
      concurrency: Number(concurrency),
    });

    res.json({ success: true, job_id: job.id });
  } catch (err) {
    console.error("Job create error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   LIST JOBS (PRIVATE per user)
   ============================================================ */
router.get("/", requireAuth, async (req, res) => {
  try {
    const jobs = await Job.findAll({
      where: { userId: req.user.id },
      include: [{ model: Script, attributes: ["id", "name", "language"] }],
      order: [["id", "DESC"]],
    });
    res.json(jobs);
  } catch (err) {
    console.error("Job list error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/rows/:rowIndex/files", requireAuth, async (req, res) => {
  const { id, rowIndex } = req.params;

  const job = await Job.findOne({
    where: { id, userId: req.user.id }
  });

  if (!job) return res.status(403).json({ error: "Forbidden" });

  const rowsDir = `/data/results/job_${id}/rows`;

  if (!fs.existsSync(rowsDir)) {
    return res.json({ files: [] });
  }

  const prefix = `row_${rowIndex}`;

  const files = fs.readdirSync(rowsDir)
    .filter(f => f.startsWith(prefix))
    .sort();

  res.json({ files });
});

router.get("/:id/rows/:rowIndex/file/:file", requireAuth, async (req, res) => {
  const { id, file } = req.params;

  const job = await Job.findOne({
    where: { id, userId: req.user.id }
  });
  if (!job) return res.status(403).json({ error: "Forbidden" });

  const filePath = `/data/results/job_${id}/rows/${file}`;

  if (!fs.existsSync(filePath))
    return res.status(404).send("File not found");

  res.sendFile(filePath);
});

/* ============================================================
   LIST ROW RESULTS (PRIVATE)
   ============================================================ */
// ============================================================
// PAGINATED ROW LIST (PRIVATE)
// /jobs/:id/rows?page=1&pageSize=23&status=success|failed|pending
// ============================================================
/* ============================================================
   PAGINATED ROWS WITH FILTER
   /jobs/:id/rows?page=1&limit=23&status=success
   ============================================================ */
router.get("/:id/rows", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 23, status = "all" } = req.query;

    const job = await Job.findOne({
      where: { id, userId: req.user.id },
    });
    if (!job) return res.status(403).json({ error: "Forbidden" });

    const rowsDir = `/data/results/job_${id}/rows`;

    if (!fs.existsSync(rowsDir)) {
      return res.json({ rows: [], totalPages: 1 });
    }

    // Load all row files
    let allFiles = fs
      .readdirSync(rowsDir)
      .filter((f) => f.endsWith(".json"))
      .sort((a, b) => {
        const na = Number(a.replace(/\D+/g, ""));
        const nb = Number(b.replace(/\D+/g, ""));
        return na - nb;
      });

    // Convert to rows with status
    let allRows = allFiles.map((file) => {
      const fullPath = path.join(rowsDir, file);
      let json;
      try {
        json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      } catch {
        json = { code: 1 };
      }

      return {
        file,
        rowIndex: Number(file.replace(/\D+/g, "")),
        status:
          json.code === 0
            ? "success"
            : json.code === 1
            ? "failed"
            : "pending",
      };
    });

    // Apply filter
    let filteredRows = allRows;
    if (status !== "all") {
      filteredRows = allRows.filter((r) => r.status === status);
    }

    // Pagination
    const pageInt = Number(page);
    const limitInt = Number(limit);

    const start = (pageInt - 1) * limitInt;
    const end = start + limitInt;

    const pageRows = filteredRows.slice(start, end);
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / limitInt));

    return res.json({
      rows: pageRows,
      totalPages,
      totalRows: filteredRows.length,
    });
  } catch (err) {
    console.error("GET rows error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   GET A ROW RESULT JSON (PRIVATE)
   ============================================================ */
router.get("/:id/rows/:file", requireAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!job) return res.status(403).json({ error: "Forbidden" });

    const fullPath = `/data/results/job_${req.params.id}/rows/${req.params.file}`;

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "Row result not found" });
    }

    const json = fs.readFileSync(fullPath, "utf8");
    return res.json(JSON.parse(json));

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


/* ============================================================
   GET JOB (PRIVATE)
   ============================================================ */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    console.log("DEBUG GET /jobs/:id - req.user:", req.user);
    console.log("DEBUG GET /jobs/:id - req.cookies:", req.cookies);

    const job = await Job.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    console.log("DEBUG GET /jobs/:id - looked up job:", job ? { id: job.id, userId: job.userId } : null);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    return res.json(job);
  } catch (err) {
    console.error("GET /jobs/:id error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   UPDATE JOB (PRIVATE)
   ============================================================ */
router.post("/:id/update", requireAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!job) return res.status(404).json({ error: "Job not found" });

    const { status, successCount, failedCount, resultPath, resultFileName } = req.body;

    await job.update({
      status,
      successCount,
      failedCount,
      resultPath,
      resultFileName,
      finishedAt: status === "completed" ? new Date() : job.finishedAt,
    });

    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   LIST LOGS (PRIVATE)
   ============================================================ */
router.get("/:id/logs", requireAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!job) return res.status(403).json({ error: "Forbidden" });

    const logsDir = `/data/results/job_${req.params.id}/logs`;
    if (!fs.existsSync(logsDir)) return res.json({ logs: [] });

    const files = fs
      .readdirSync(logsDir)
      .filter((f) => f.endsWith(".log"))
      .sort((a, b) => {
        const na = Number(a.replace(/\D+/g, ""));
        const nb = Number(b.replace(/\D+/g, ""));
        return na - nb;
      });

    return res.json({ logs: files });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   GET A LOG FILE (PRIVATE)
   ============================================================ */
router.get("/:id/logs/:file", requireAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!job) return res.status(403).json({ error: "Forbidden" });

    const fullPath = `/data/results/job_${req.params.id}/logs/${req.params.file}`;
    if (!fs.existsSync(fullPath)) return res.status(404).send("Log not found");

    return res.sendFile(fullPath);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   GET RESULTS CSV (PRIVATE)
   ============================================================ */
router.get("/:id/results", requireAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!job) return res.status(403).send("Forbidden");

    const file = `/data/results/job_${req.params.id}/results.csv`;
    if (!fs.existsSync(file)) return res.status(404).send("Results file not found");

    return res.sendFile(file);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------- ADD: Abort endpoint ----------
router.post("/:id/abort", requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const job = await Job.findOne({ where: { id, userId: req.user.id } });
    if (!job) return res.status(404).json({ error: "Job not found" });

    // mark DB row as aborted
    await job.update({ status: "aborted", finishedAt: new Date() });

    // mark Redis key for fast worker checks (expires in 24h)
    const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    await redis.set(`job:aborted:${id}`, "1", "EX", 60 * 60 * 24).catch(()=>{});
    redis.disconnect?.();

    // Best-effort: try to remove waiting/delayed jobs in bulkQueue that belong to this parent job
    // NOTE: this is best-effort because BullMQ doesn't provide a single atomic remove by payload.
    try {
      const waiting = await bulkQueue.getJobs(["waiting", "delayed", "paused"]);
      const removePromises = [];
      for (const qjob of waiting) {
        try {
          const data = qjob.data || {};
          if (data.parentJobId == id || data.jobId == id) {
            removePromises.push(bulkQueue.removeJobs(qjob.id));
          }
        } catch (e) {}
      }
      await Promise.allSettled(removePromises);
    } catch (e) {
      // ignore — not fatal
      console.warn("Abort: could not prune queue items:", e?.message || e);
    }

    return res.json({ success: true, aborted: true });
  } catch (err) {
    console.error("Abort job error:", err);
    return res.status(500).json({ error: err.message });
  }
});
// ---------- END: Abort endpoint ----------

/* ============================================================
   LIST ALL RESULT FILES IN JOB FOLDER (PRIVATE)
   ============================================================ */
router.get("/:id/files", requireAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!job) return res.status(403).json({ error: "Forbidden" });

    const jobDir = `/data/results/job_${req.params.id}`;
    if (!fs.existsSync(jobDir))
      return res.json({ files: [] });

    const allFiles = fs
      .readdirSync(jobDir)
      .filter(f => !["logs", "rows"].includes(f)) // skip folders
      .map(f => ({ name: f }));

    return res.json({ files: allFiles });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   DOWNLOAD ANY FILE FROM JOB FOLDER (PRIVATE)
   ============================================================ */
router.get("/:id/file/:file", requireAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!job) return res.status(403).json({ error: "Forbidden" });

    const filePath = `/data/results/job_${req.params.id}/${req.params.file}`;

    if (!fs.existsSync(filePath))
      return res.status(404).send("File not found");

    return res.download(filePath);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;