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
    // EXDEV or cross-device link — fallback to copy + unlink
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

/* ============================================================
   CREATE BULK (protected)
   - inputFile: csv
   - script_id: id of script (must belong to user)
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

    // Persist CSV into job folder
    const jobFolder = `/data/uploads/job_${parent.id}`;
    if (!fs.existsSync(jobFolder)) fs.mkdirSync(jobFolder, { recursive: true });

    const destPath = path.join(jobFolder, `input_${Date.now()}.csv`);
    moveFileFallback(req.file.path, destPath);

    parent.input_file_path = destPath;
    await parent.save();

    // Stream CSV and enqueue rows in chunks
    
    let total = 0;
    let buffer = [];
    let rowIndex = 0;
    let firstRow = true;  // <--- ADD THIS FLAG

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
      // Skip the header row completely
      if (firstRow) {
        firstRow = false;
        // If row has no actual values, skip it
        if (Object.values(row).every(v => !v || String(v).trim() === "")) return;
        return;  // ALWAYS SKIP FIRST DATA EVENT
      }

      // ignore empty rows
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
      console.log(`✅ Bulk enqueue complete: job=${parent.id}, rows=${total}`);
      return res.json({ success: true, jobId: parent.id, totalRows: total });
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

  const prefix = `row_${rowIndex}.`;

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
router.get("/:id/rows", requireAuth, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!job) return res.status(403).json({ error: "Forbidden" });

    const rowsDir = `/data/results/job_${req.params.id}/rows`;

    if (!fs.existsSync(rowsDir)) {
      return res.json({ rows: [] });
    }

    const files = fs
      .readdirSync(rowsDir)
      .filter((f) => f.endsWith(".json"))
      .sort((a, b) => {
        const na = Number(a.replace(/\D+/g, ""));
        const nb = Number(b.replace(/\D+/g, ""));
        return na - nb;
      });

    const rows = files.map((f) => ({
      file: f,
      rowIndex: Number(f.replace(/\D+/g, "")),
      status: f.includes("json") ? "done" : "pending",
    }));

    return res.json({ rows });

  } catch (err) {
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

export default router;