// src/workers/node/batch_row_worker.js
import { Worker } from "bullmq";
import IORedis from "ioredis";
import pLimit from "p-limit";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { REDIS_URL, QUEUE_PREFIX } from "../../config/env.js";
import JobModel from "../../api/models/Job.js";

const redisConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Tune via env
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 5);
const WORKER_MAX_CHILDREN = Number(process.env.WORKER_MAX_CHILDREN || 1000);

const limit = pLimit(WORKER_MAX_CHILDREN);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// robust move (handles EXDEV)
function moveFileFallback(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    fs.copyFileSync(src, dest);
    try { fs.unlinkSync(src); } catch(e){}
  }
}

// write an atomic append to a file (sync is fine here for log correctness)
function appendToFile(filePath, data) {
  try {
    fs.appendFileSync(filePath, data);
  } catch (e) {
    // best-effort, log to console
    console.warn("appendToFile error:", e?.message || e);
  }
}

async function compileMasterResultsIfComplete(jobId) {
  try {
    const job = await JobModel.findByPk(jobId);
    if (!job) return;

    // If totals are unknown, skip
    if (!job.totalItems || job.totalItems === 0) return;

    if (job.processedRows < job.totalItems) {
      return; // not complete yet
    }

    // Build master CSV
    const jobDir = `/data/results/job_${jobId}`;
    const rowsDir = path.join(jobDir, "rows");
    if (!fs.existsSync(rowsDir)) return;

    const files = fs.readdirSync(rowsDir).filter(f => f.endsWith(".json"));
    files.sort((a,b) => {
      const na = Number(a.replace(/\D+/g,"")) || 0;
      const nb = Number(b.replace(/\D+/g,"")) || 0;
      return na - nb;
    });

    const masterPath = path.join(jobDir, "master_results.csv");
    // header
    fs.writeFileSync(masterPath, "rowIndex,result_json\n");

    for (const f of files) {
      try {
        const full = path.join(rowsDir, f);
        const raw = fs.readFileSync(full, "utf8");
        const idx = Number(f.replace(/\D+/g,"")) || 0;
        // sanitize newlines
        const safe = JSON.stringify(JSON.parse(raw)).replace(/\n/g, "\\n").replace(/\r/g, "\\r");
        fs.appendFileSync(masterPath, `${idx},${safe}\n`);
      } catch (e) {
        console.warn("Skipping result file on master compile:", f, e?.message || e);
      }
    }

    // Optionally update job record with result path and mark completed
    await job.update({ resultPath: masterPath, status: "completed", finishedAt: new Date() });
    console.log(`✅ Master results written for job ${jobId} -> ${masterPath}`);
  } catch (e) {
    console.warn("compileMasterResultsIfComplete error:", e?.message || e);
  }
}

async function runRow(scriptPath, rowData, jobId, rowIndex) {
  // Prepare directories & file paths
  const jobDir = `/data/results/job_${jobId}`;
  const logsDir = path.join(jobDir, "logs");
  const rowsDir = path.join(jobDir, "rows");
  ensureDir(logsDir);
  ensureDir(rowsDir);

  const logFile = path.join(logsDir, `row_${rowIndex}.log`);
  const resultFile = path.join(rowsDir, `row_${rowIndex}.json`);

  // Ensure log file exists
  try { fs.writeFileSync(logFile, `ROW DATA: ${JSON.stringify(rowData)}\n`); } catch(e){}

  // Decide runner (python vs node)
  const ext = path.extname(scriptPath).toLowerCase();
  const isPy = ext === ".py";
  const cmd = isPy ? (process.env.PYTHON_BIN || "python3") : "node";

  // Pass rowData as JSON string argument – script can parse process.argv[2]
  const args = [scriptPath, JSON.stringify(rowData), `--logFile=${logFile}`, `--resultFile=${resultFile}`];

  return new Promise((resolve) => {
    // spawn child WITHOUT shell for safer execution
    const proc = spawn(cmd, args, { shell: false });

    // Stream child's stdout/stderr into log file as they arrive
    proc.stdout.on("data", (d) => {
      const s = d.toString();
      appendToFile(logFile, s);
    });

    proc.stderr.on("data", (d) => {
      const s = d.toString();
      appendToFile(logFile, s);
    });

    let out = "";
    let err = "";

    // Keep capturing full output to store in result JSON (bounded)
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { err += d.toString(); });

    proc.on("close", async (code) => {
      try {
        // Finalize log with exit code
        appendToFile(logFile, `\nEXIT=${code}\n`);

        // Write per-row result JSON (overwrites)
        const resultObj = { code, out, err, rowData, rowIndex, finishedAt: new Date().toISOString() };
        try {
          fs.writeFileSync(resultFile, JSON.stringify(resultObj));
        } catch (e) {
          console.warn("Failed writing result file:", e?.message || e);
        }

        // Update DB counts (increment)
        await JobModel.increment(
          {
            processedRows: 1,
            successCount: code === 0 ? 1 : 0,
            failedCount: code === 0 ? 0 : 1
          },
          { where: { id: jobId } }
        ).catch(e => {
          console.warn("JobModel.increment warning:", e?.message || e);
        });

        // After increment, check if job is complete and compile master if so
        // Small delay to allow DB to settle
        setTimeout(() => compileMasterResultsIfComplete(jobId), 200);

      } catch (e) {
        console.warn("runRow post-processing error:", e?.message || e);
      }

      resolve({ code, out, err });
    });

    proc.on("error", async (e) => {
      appendToFile(logFile, `\nPROC ERROR: ${e.stack || e}\n`);
      // write failed result
      try {
        fs.writeFileSync(resultFile, JSON.stringify({ code: 1, out: "", err: String(e), rowData, rowIndex }));
      } catch(e){}

      await JobModel.increment(
        { processedRows: 1, failedCount: 1 },
        { where: { id: jobId } }
      ).catch(()=>{});

      setTimeout(() => compileMasterResultsIfComplete(jobId), 200);

      resolve({ code: 1, out: "", err: e.message || String(e) });
    });
  });
}

// Processor used by Worker
async function processorFn(job) {
  const data = job.data || {};
  const parentJobId = data.parentJobId || data.jobId || data.parent_id;
  const rowIndex = data.rowIndex || data.index || 0;
  const rowData = data.rowData || data.row || {};
  const script_path = data.script_path || data.scriptPath || data.script;

  if (!parentJobId || !script_path) {
    throw new Error("Invalid job payload: missing parentJobId or script_path");
  }

  // Run via p-limit to ensure total children stay under WORKER_MAX_CHILDREN
  return limit(() => runRow(script_path, rowData, parentJobId, rowIndex));
}

// Create the Worker (uses configurable prefix)
const worker = new Worker(
  "batch-row",
  processorFn,
  {
    connection: redisConnection,
    concurrency: WORKER_CONCURRENCY,
    prefix: QUEUE_PREFIX || undefined
  }
);

worker.on("completed", (job) => {
  // completed event handled per-row; master compiled after DB increments in runRow
});

worker.on("failed", (job, err) => {
  console.error("batch-row job failed", job?.id, err?.message || err);
});

console.log("batch-row worker started (node). Concurrency:", WORKER_CONCURRENCY, "Max Children:", WORKER_MAX_CHILDREN, "Prefix:", QUEUE_PREFIX);