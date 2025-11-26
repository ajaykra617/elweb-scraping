// src/workers/node/batch_row_worker.js
import { Worker } from "bullmq";
import IORedis from "ioredis";
import pLimit from "p-limit";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { REDIS_URL, QUEUE_PREFIX } from "../../config/env.js";
import JobModel from "../../api/models/Job.js";
import axios from "axios";

async function runPythonRemote(payload) {
  const PY_URL = process.env.PY_WORKER_URL || "http://python-service:9000/run";
  const res = await axios.post(PY_URL, payload, { timeout: 300000 });
  return res.data;
}

// NEW IMPORTS (Python RPC + Piscina worker)
import Piscina from "piscina";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const piscina = new Piscina({
  filename: path.join(__dirname, "piscina_worker.mjs"),
  maxThreads: Number(process.env.PISCINA_THREADS || 6)
});

import { runPythonRPC } from "./python_client.mjs";

const redisConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Tune via env
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 5);
const WORKER_MAX_CHILDREN = Number(process.env.WORKER_MAX_CHILDREN || 1000);

const limit = pLimit(WORKER_MAX_CHILDREN);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// write atomic append
function appendToFile(filePath, data) {
  try { fs.appendFileSync(filePath, data); }
  catch (e) { console.warn("appendToFile error:", e.message); }
}

async function compileMasterResultsIfComplete(jobId) {
  try {
    const job = await JobModel.findByPk(jobId);
    if (!job || !job.totalItems) return;
    if (job.processedRows < job.totalItems) return;

    const jobDir = `/data/results/job_${jobId}`;
    const rowsDir = path.join(jobDir, "rows");

    if (!fs.existsSync(rowsDir)) return;

    const files = fs.readdirSync(rowsDir).filter(f => f.endsWith(".json"));
    files.sort((a,b) => Number(a.replace(/\D+/g,"")) - Number(b.replace(/\D+/g,"")));

    const masterPath = path.join(jobDir, "master_results.csv");
    fs.writeFileSync(masterPath, "rowIndex,result_json\n");

    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(rowsDir, f), "utf8");
        const idx = Number(f.replace(/\D+/g,""));
        const safe = JSON.stringify(JSON.parse(raw)).replace(/\n/g, "\\n");
        fs.appendFileSync(masterPath, `${idx},${safe}\n`);
      } catch (e) {}
    }

    await job.update({ resultPath: masterPath, status:"completed", finishedAt:new Date() });
    console.log("MASTER CSV CREATED for job", jobId);
  } catch (e) {
    console.warn("master compile error:", e.message);
  }
}

//
//  🔥🔥🔥 REPLACED runRow() WITH PYTHON-RPC + PISCINA + FALLBACK TO SPAWN
//
async function runRow(scriptPath, rowData, jobId, rowIndex) {
  const jobDir = `/data/results/job_${jobId}`;
  const logsDir = path.join(jobDir, "logs");
  const rowsDir = path.join(jobDir, "rows");

  ensureDir(logsDir);
  ensureDir(rowsDir);

  const logFile = path.join(logsDir, `row_${rowIndex}.log`);
  const resultFile = path.join(rowsDir, `row_${rowIndex}.json`);

  fs.writeFileSync(logFile, `ROW DATA: ${JSON.stringify(rowData)}\n`);

  // 1️⃣ ABORT CHECK
  try {
    const j = await JobModel.findByPk(jobId);
    if (j?.status === "aborted") {
      appendToFile(logFile, "⛔ SKIPPED - JOB ABORTED\n");
      fs.writeFileSync(resultFile, JSON.stringify({ code:1, out:"Aborted", err:"" }));
      await JobModel.increment({ processedRows:1, failedCount:1 }, { where:{ id:jobId }});
      setTimeout(() => compileMasterResultsIfComplete(jobId), 200);
      return { code:1, out:"Aborted", err:"" };
    }
  } catch(err){}

  const ext = path.extname(scriptPath).toLowerCase();
  const isPy = ext === ".py";
  const isJs = ext === ".js" || ext === ".mjs";

  //
  // 2️⃣ PYTHON SCRIPTS → PYTHON-SERVICE RPC
  //
  if (isPy) {
    try {
        const rpc = await runPythonRPC({
  script_path: scriptPath,
  rowData: rowData,
  jobId: jobId,
  rowIndex: rowIndex,
  resultFile: resultFile,
  logFile: logFile
});

      const outObj = {
        code: rpc.code,
        out: rpc.out,
        err: rpc.err,
        rowData,
        rowIndex,
        finishedAt: new Date().toISOString()
      };

      fs.writeFileSync(resultFile, JSON.stringify(outObj));

      await JobModel.increment(
        {
          processedRows:1,
          successCount: rpc.code===0 ? 1 : 0,
          failedCount: rpc.code===0 ? 0 : 1
        },
        { where:{ id:jobId } }
      );

      setTimeout(() => compileMasterResultsIfComplete(jobId), 200);
      return { code: rpc.code, out: rpc.out, err: rpc.err };

    } catch (err) {
      appendToFile(logFile, "PYTHON RPC ERROR: " + err.message);
      fs.writeFileSync(resultFile, JSON.stringify({ code:1, out:"", err:err.message }));
      return { code:1, out:"", err:err.message };
    }
  }

  //
  // 3️⃣ NODE MODULE SCRIPTS → TRY PISCINA
  //
  if (isJs) {
    try {
      let full = scriptPath;
      if (!path.isAbsolute(full)) {
        const p = path.join("/data/scripts", scriptPath);
        if (fs.existsSync(p)) full = p;
      }

      const res = await piscina.run(
        { scriptPath: full, row: rowData, resultFile, logFile },
        { name: "runUserModule" }
      );

      const outObj = {
        code: res.code || 0,
        out: res.out || "",
        err: res.err || "",
        rowData,
        rowIndex,
        finishedAt: new Date().toISOString()
      };

      fs.writeFileSync(resultFile, JSON.stringify(outObj));

      await JobModel.increment(
        {
          processedRows:1,
          successCount: outObj.code===0 ? 1 : 0,
          failedCount: outObj.code===0 ? 0 : 1
        },
        { where:{ id:jobId }}
      );

      setTimeout(() => compileMasterResultsIfComplete(jobId), 200);
      return outObj;

    } catch (err) {
      appendToFile(logFile, `Piscina failed → fallback spawn: ${err.message}\n`);
    }
  }

  //
  // 4️⃣ FALLBACK → ORIGINAL BEHAVIOR (SPAWN)
  //
  if(isJs) {
    const cmd = "node";
  }
  if (isPy) {
  appendToFile(logFile, "📡 Sending task to Python service...\n");

  try {
        const result = await runPythonRemote({
  script_path: scriptPath,
  rowData: rowData,
  jobId: jobId,
  rowIndex: rowIndex,
  resultFile: resultFile,
  logFile: logFile
});
    // Save result JSON same as node
    fs.writeFileSync(resultFile, JSON.stringify({
      code: result.code,
      out: result.out,
      err: result.err,
      rowData,
      rowIndex,
      finishedAt: new Date().toISOString(),
    }));

    await JobModel.increment(
      {
        processedRows: 1,
        successCount: result.code === 0 ? 1 : 0,
        failedCount: result.code === 0 ? 0 : 1
      },
      { where: { id: jobId } }
    );

    setTimeout(() => compileMasterResultsIfComplete(jobId), 200);
    return result;

  } catch (err) {
    appendToFile(logFile, `Python worker error: ${err.message}\n`);

    fs.writeFileSync(resultFile, JSON.stringify({
      code: 1,
      out: "",
      err: err.message,
      rowData,
      rowIndex
    }));

    await JobModel.increment(
      { processedRows: 1, failedCount: 1 },
      { where: { id: jobId } }
    );

    setTimeout(() => compileMasterResultsIfComplete(jobId), 200);
    return { code: 1, out: "", err: err.message };
  }
}
  const args = [
    scriptPath,
    JSON.stringify(rowData),
    `--logFile=${logFile}`,
    `--resultFile=${resultFile}`
  ];

  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell:false });

    let out = "", err = "";

    proc.stdout.on("data", d => { out += d; appendToFile(logFile, d.toString()); });
    proc.stderr.on("data", d => { err += d; appendToFile(logFile, d.toString()); });

    proc.on("close", async (code) => {
      fs.writeFileSync(resultFile, JSON.stringify({
        code, out, err, rowData, rowIndex, finishedAt:new Date().toISOString()
      }));

      await JobModel.increment(
        {
          processedRows:1,
          successCount: code===0?1:0,
          failedCount: code===0?0:1
        },
        { where:{id:jobId}}
      );

      setTimeout(() => compileMasterResultsIfComplete(jobId), 200);
      resolve({ code, out, err });
    });
  });
}

// Worker processor
async function processorFn(job) {
  const data = job.data || {};
  const parentJobId = data.parentJobId;
  const rowIndex = data.rowIndex;
  const rowData = data.rowData;
  const scriptPath = data.script_path;

  if (!parentJobId || !scriptPath)
    throw new Error("Invalid job payload");

  return limit(() => runRow(scriptPath, rowData, parentJobId, rowIndex));
}

const worker = new Worker(
  "batch-row",
  processorFn,
  {
    connection: redisConnection,
    concurrency: WORKER_CONCURRENCY,
    settings: {
      backoffStrategy: (n) => Math.min(5000, n*500),
      lockDuration: 30000,
      stalledInterval: 30000
    },
    prefix: QUEUE_PREFIX || undefined
  }
);

worker.on("failed", (job, err) => {
  console.error("batch-row failed:", job?.id, err.message);
});

console.log("batch-row worker started", WORKER_CONCURRENCY);