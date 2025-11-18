// // // src/workers/node/batch_row_worker.js
// // import { Worker } from "bullmq";
// // import IORedis from "ioredis";
// // import pLimit from "p-limit";
// // import { spawn } from "child_process";
// // import fs from "fs";
// // import path from "path";
// // import { REDIS_URL, QUEUE_PREFIX } from "../../config/env.js";
// // import JobModel from "../../api/models/Job.js";

// // // Redis connections
// // const redisConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
// // const redisPub = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// // // Limits
// // const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 5);
// // const WORKER_MAX_CHILDREN = Number(process.env.WORKER_MAX_CHILDREN || 1000);
// // const limit = pLimit(WORKER_MAX_CHILDREN);

// // // -------------------------
// // // Helpers
// // // -------------------------
// // function ensureDir(dir) {
// //   if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
// // }

// // function appendResult(jobId, rowIndex, output) {
// //   const resultDir = `/data/results/job_${jobId}`;
// //   ensureDir(resultDir);

// //   const csvFile = path.join(resultDir, "results.csv");
// //   if (!fs.existsSync(csvFile)) {
// //     fs.writeFileSync(csvFile, "rowIndex,output\n");
// //   }

// //   const safe = JSON.stringify(output).replace(/\n/g, "\\n");
// //   fs.appendFileSync(csvFile, `${rowIndex},${safe}\n`);
// // }

// // // -------------------------
// // // Row execution
// // // -------------------------
// // async function runRow(scriptPath, rowData, jobId, rowIndex) {
// //   const ext = path.extname(scriptPath).toLowerCase();
// //   const isPy = ext === ".py";

// //   const cmd = isPy ? (process.env.PYTHON_BIN || "python3") : "node";
// //   const args = [scriptPath, JSON.stringify(rowData)];

// //   return new Promise((resolve) => {
// //     const proc = spawn(cmd, args, { shell: false });

// //     let out = "";
// //     let err = "";

// //     proc.stdout.on("data", (d) => (out += d.toString()));
// //     proc.stderr.on("data", (d) => (err += d.toString()));

// //     // -------------- ON CLOSE --------------
// //     proc.on("close", async (code) => {
// //       try {
// //         // Write row log
// //         const logDir = `/data/results/job_${jobId}/logs`;
// //         ensureDir(logDir);

// //         const logFile = path.join(logDir, `row_${rowIndex}.log`);
// //         fs.writeFileSync(
// //           logFile,
// //           `exit=${code}\nSTDOUT:\n${out}\n\nSTDERR:\n${err}\n`
// //         );

// //         // Append results.csv
// //         appendResult(jobId, rowIndex, { code, out, err });

// //         // Update job counters
// //         await JobModel.increment(
// //           {
// //             processedRows: 1,
// //             successCount: code === 0 ? 1 : 0,
// //             failedCount: code === 0 ? 0 : 1,
// //           },
// //           { where: { id: jobId } }
// //         ).catch(() => {});

// //         // Fetch updated job for progress
// //         const updated = await JobModel.findByPk(jobId, {
// //           attributes: [
// //             "id",
// //             "processedRows",
// //             "totalItems",
// //             "successCount",
// //             "failedCount",
// //             "status",
// //           ],
// //         });

// //         // Publish progress update
// //         redisPub.publish(
// //           `progress:${jobId}`,
// //           JSON.stringify({
// //             jobId: updated.id,
// //             processedRows: updated.processedRows,
// //             totalItems: updated.totalItems,
// //             successCount: updated.successCount,
// //             failedCount: updated.failedCount,
// //             status: updated.status,
// //           })
// //         );

// //         // Mark completed when done
// //         if (
// //           updated.totalItems &&
// //           updated.processedRows >= updated.totalItems
// //         ) {
// //           await updated
// //             .update({ status: "completed", finishedAt: new Date() })
// //             .catch(() => {});

// //           redisPub.publish(
// //             `progress:${jobId}`,
// //             JSON.stringify({
// //               jobId: updated.id,
// //               status: "completed",
// //             })
// //           );
// //         }
// //       } catch (e) {
// //         console.warn("runRow post-processing error:", e?.message || e);
// //       }

// //       resolve({ code, out, err });
// //     });

// //     // -------------- ON ERROR SPAWN --------------
// //     proc.on("error", async (e) => {
// //       const logDir = `/data/results/job_${jobId}/logs`;
// //       ensureDir(logDir);

// //       fs.appendFileSync(
// //         path.join(logDir, `row_${rowIndex}.log`),
// //         `PROC ERROR: ${e.stack || e}\n`
// //       );

// //       await JobModel.increment(
// //         { processedRows: 1, failedCount: 1 },
// //         { where: { id: jobId } }
// //       ).catch(() => {});

// //       // Publish failed progress
// //       redisPub.publish(
// //         `progress:${jobId}`,
// //         JSON.stringify({
// //           jobId,
// //           error: e.message || String(e),
// //         })
// //       );

// //       resolve({ code: 1, out: "", err: e.message || String(e) });
// //     });
// //   });
// // }

// // // -------------------------
// // // BullMQ processor
// // // -------------------------
// // async function processorFn(job) {
// //   const data = job.data || {};
// //   const parentJobId = data.parentJobId || data.jobId || data.parent_id;
// //   const rowIndex = data.rowIndex || data.index || 0;
// //   const rowData = data.rowData || data.row || {};
// //   const script_path = data.script_path || data.scriptPath || data.script;

// //   if (!parentJobId || !script_path) {
// //     throw new Error("Invalid job payload: missing parentJobId or script_path");
// //   }

// //   return limit(async () => {
// //     // 🔵 1) Mark job as RUNNING when first row starts
// //     try {
// //       const parent = await JobModel.findByPk(parentJobId);
// //       if (parent && parent.status === "queued") {
// //         await parent.update({
// //           status: "running",
// //           startedAt: new Date(),
// //         });
// //         console.log(`🔵 Job ${parentJobId} marked as RUNNING`);
// //       }
// //     } catch (err) {
// //       console.warn("Failed to mark running:", err?.message || err);
// //     }

// //     // 🔵 2) Process row
// //     const result = await runRow(script_path, rowData, parentJobId, rowIndex);

// //     // 🔵 3) When last row done → mark COMPLETED
// //     try {
// //       const parent = await JobModel.findByPk(parentJobId);

// //       if (
// //         parent &&
// //         parent.totalItems > 0 &&
// //         parent.processedRows >= parent.totalItems &&
// //         parent.status !== "completed"
// //       ) {
// //         await parent.update({
// //           status: "completed",
// //           finishedAt: new Date(),
// //         });
// //         console.log(`🟢 Job ${parentJobId} marked as COMPLETED`);
// //       }
// //     } catch (err) {
// //       console.warn("Completion update failed:", err?.message || err);
// //     }

// //     return result;
// //   });
// // }

// // // -------------------------
// // // Worker
// // // -------------------------
// // const worker = new Worker("batch-row", processorFn, {
// //   connection: redisConnection,
// //   concurrency: WORKER_CONCURRENCY,
// //   prefix: QUEUE_PREFIX,
// // });

// // worker.on("completed", () => {});
// // worker.on("failed", (job, err) => {
// //   console.error(
// //     "batch-row job failed",
// //     job?.id,
// //     err?.message || err
// //   );
// // });

// // console.log(
// //   "batch-row worker started (node). Concurrency:",
// //   WORKER_CONCURRENCY,
// //   "Max Children:",
// //   WORKER_MAX_CHILDREN,
// //   "Prefix:",
// //   QUEUE_PREFIX
// // );


// // src/workers/node/batch_row_worker.js
// import { Worker } from "bullmq";
// import IORedis from "ioredis";
// import pLimit from "p-limit";
// import { spawn } from "child_process";
// import fs from "fs";
// import path from "path";
// import { REDIS_URL, QUEUE_PREFIX } from "../../config/env.js";
// import JobModel from "../../api/models/Job.js";

// const redisConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// // Worker controls
// const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 5);
// const WORKER_MAX_CHILDREN = Number(process.env.WORKER_MAX_CHILDREN || 1000);

// const limit = pLimit(WORKER_MAX_CHILDREN);

// function ensureDir(dir) {
//   if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
// }

// /* --------------------------------------------------------
//    LIVE APPEND TO results.csv PER LOG CHUNK
// --------------------------------------------------------- */
// function appendLiveResult(jobId, rowIndex, chunk, type = "stdout") {
//   const resultDir = `/data/results/job_${jobId}`;
//   ensureDir(resultDir);

//   const csvFile = path.join(resultDir, "results.csv");
//   if (!fs.existsSync(csvFile)) {
//     fs.writeFileSync(csvFile, "rowIndex,type,message\n");
//   }

//   const safe = chunk.replace(/\n/g, "\\n");
//   fs.appendFileSync(csvFile, `${rowIndex},${type},"${safe}"\n`);
// }

// /* --------------------------------------------------------
//    RUN A SINGLE ROW WITH LIVE LOGGING
// --------------------------------------------------------- */
// async function runRow(scriptPath, rowData, jobId, rowIndex) {
//   const ext = path.extname(scriptPath).toLowerCase();
//   const isPy = ext === ".py";
//   const cmd = isPy ? (process.env.PYTHON_BIN || "python3") : "node";
//   const args = [scriptPath, JSON.stringify(rowData)];

//   return new Promise((resolve) => {
//     const proc = spawn(cmd, args, { shell: false });

//     const logDir = `/data/results/job_${jobId}/logs`;
//     ensureDir(logDir);

//     const logFile = path.join(logDir, `row_${rowIndex}.log`);

//     let out = "";
//     let err = "";

//     // ---------- LIVE STDOUT ----------
//     proc.stdout.on("data", (d) => {
//       const msg = d.toString();
//       out += msg;

//       // Append to log file
//       fs.appendFileSync(logFile, `[STDOUT] ${msg}`);

//       // Append incrementally to results.csv
//       appendLiveResult(jobId, rowIndex, msg, "stdout");
//     });

//     // ---------- LIVE STDERR ----------
//     proc.stderr.on("data", (d) => {
//       const msg = d.toString();
//       err += msg;

//       fs.appendFileSync(logFile, `[STDERR] ${msg}`);
//       appendLiveResult(jobId, rowIndex, msg, "stderr");
//     });

//     // ---------- PROCESS EXIT ----------
//     proc.on("close", async (code) => {
//       fs.appendFileSync(
//         logFile,
//         `\n===== PROCESS EXIT ${code} =====\n`
//       );

//       // Final result row
//       appendLiveResult(jobId, rowIndex, `EXIT_CODE:${code}`, "exit");

//       // Update DB counters
//       try {
//         await JobModel.increment(
//           {
//             processedRows: 1,
//             successCount: code === 0 ? 1 : 0,
//             failedCount: code === 0 ? 0 : 1,
//           },
//           { where: { id: jobId } }
//         );
//       } catch (e) {
//         console.warn("JobModel.increment warning:", e?.message);
//       }

//       resolve({ code, out, err });
//     });

//     // ---------- SPAWN ERROR ----------
//     proc.on("error", async (e) => {
//       fs.appendFileSync(logFile, `\n[PROCESS ERROR] ${e.stack || e}\n`);

//       appendLiveResult(jobId, rowIndex, e.message || String(e), "stderr");

//       await JobModel.increment(
//         { processedRows: 1, failedCount: 1 },
//         { where: { id: jobId } }
//       ).catch(() => {});

//       resolve({ code: 1, out: "", err: e.message });
//     });
//   });
// }

// /* --------------------------------------------------------
//    BULLMQ WORKER PROCESSOR
// --------------------------------------------------------- */
// async function processorFn(job) {
//   const data = job.data || {};

//   const parentJobId = data.parentJobId || data.jobId;
//   const rowIndex = data.rowIndex || 0;
//   const rowData = data.rowData || {};
//   const script_path = data.script_path;

//   if (!parentJobId || !script_path)
//     throw new Error("Invalid job payload: missing parentJobId or script_path");

//   return limit(() => runRow(script_path, rowData, parentJobId, rowIndex));
// }

// /* --------------------------------------------------------
//    WORKER INITIALIZATION
// --------------------------------------------------------- */
// const worker = new Worker("batch-row", processorFn, {
//   connection: redisConnection,
//   concurrency: WORKER_CONCURRENCY,
//   prefix: QUEUE_PREFIX,
// });

// worker.on("failed", (job, err) => {
//   console.error("batch-row failed:", job?.id, err?.message);
// });

// console.log(
//   "batch-row worker started | concurrency:",
//   WORKER_CONCURRENCY,
//   "prefix:",
//   QUEUE_PREFIX
// );

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