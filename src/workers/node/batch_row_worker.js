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
// ---------- Helpers for master files (paste near top with other functions) ----------
function safeFilename(f) {
  return f.replace(/\.\./g, "").replace(/[^a-zA-Z0-9_\-\.]/g, "_");
}

function readAllFiles(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
}

function isMasterFile(name) {
  return /^master_/.test(name);
}

// Try load archiver (optional). If not available, we will skip zipping.
let archiver = null;
try {
  // prefer dynamic require to avoid breaking ESM builds that don't bundle it
  // if using native ESM imports in your project you may replace with: import archiver from 'archiver';
  // but dynamic require is safe here because Node will resolve it if present.
  // eslint-disable-next-line no-undef
  archiver = require("archiver");
} catch (e) {
  archiver = null;
  console.warn("archiver not available — zip artifacts will be skipped. Install 'archiver' to enable zipping.");
}

async function makeZip(outputPath, files, baseDir) {
  return new Promise((resolve, reject) => {
    if (!archiver) {
      return resolve(false);
    }
    try {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      output.on("close", () => resolve(true));
      archive.on("error", (err) => reject(err));
      archive.pipe(output);
      for (const f of files) {
        const abs = path.join(baseDir, f);
        // only add if exists and is file
        try {
          const st = fs.statSync(abs);
          if (st.isFile()) {
            archive.file(abs, { name: f });
          }
        } catch (e) {
          // skip missing file
        }
      }
      archive.finalize();
    } catch (e) {
      return reject(e);
    }
  });
}

// ---------- New compileMasterResultsIfComplete implementation ----------
async function compileMasterResultsIfComplete(jobId) {
  try {
    const job = await JobModel.findByPk(jobId);
    if (!job) return;

    // If totals are unknown, skip
    if (!job.totalItems || job.totalItems === 0) return;

    if (job.processedRows < job.totalItems) {
      return; // not complete yet
    }

    const jobDir = `/data/results/job_${jobId}`;
    const rowsDir = path.join(jobDir, "rows");
    if (!fs.existsSync(rowsDir)) return;

    // List files in rowsDir excluding any master_ files
    const allFiles = readAllFiles(rowsDir).filter(f => !isMasterFile(f));

    // Partition files by extension and by "row_" prefix
    const grouped = {};
    for (const f of allFiles) {
      // only consider files that appear to be row outputs
      if (!/^row_/.test(f)) continue;
      const extMatch = (f.match(/\.(\w+)$/) || [null, ""]).slice(1)[0] || "";
      const ext = extMatch.toLowerCase();
      if (!grouped[ext]) grouped[ext] = [];
      grouped[ext].push(f);
    }

    // ---------- 1) MASTER JSON (Option A: JSON string) ----------
    const jsonFiles = (grouped["json"] || []).sort((a,b) => {
      return Number(a.replace(/\D+/g,"")) - Number(b.replace(/\D+/g,""));
    });

    const masterJsonPath = path.join(jobDir, "master_json.csv");
    // header
    fs.writeFileSync(masterJsonPath, "rowIndex,result_json\n");

    for (const f of jsonFiles) {
      try {
        const full = path.join(rowsDir, f);
        const raw = fs.readFileSync(full, "utf8").trim();
        // keep JSON as provided, but ensure it's valid JSON — if not, store raw string escaped
        let safeJsonString;
        try {
          // ensure we can parse (if already JSON)
          const parsed = JSON.parse(raw);
          safeJsonString = JSON.stringify(parsed).replace(/\n/g, "\\n").replace(/\r/g, "\\r");
        } catch (e) {
          // not valid JSON, escape raw
          safeJsonString = JSON.stringify(String(raw)).replace(/\n/g, "\\n").replace(/\r/g, "\\r");
        }
        const idx = Number(f.replace(/\D+/g,"")) || 0;
        fs.appendFileSync(masterJsonPath, `${idx},${safeJsonString}\n`);
      } catch (e) {
        console.warn("master_json: skipping file", f, e?.message || e);
      }
    }

    // ---------- 2) MASTER CSV (concatenate per-row CSVs) ----------
    const csvFiles = (grouped["csv"] || []).sort((a,b) => {
      return Number(a.replace(/\D+/g,"")) - Number(b.replace(/\D+/g,""));
    });

    if (csvFiles.length > 0) {
      const masterCsvPath = path.join(jobDir, "master_csv.csv");
      let headerWritten = false;
      for (const f of csvFiles) {
        try {
          const full = path.join(rowsDir, f);
          const content = fs.readFileSync(full, "utf8");
          // split into lines
          const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
          if (lines.length === 0) continue;
          const header = lines[0];
          const dataLines = lines.slice(1);

          if (!headerWritten) {
            fs.writeFileSync(masterCsvPath, header + "\n");
            headerWritten = true;
          } else {
            // optionally check header mismatch and still append
            // (we don't strictly enforce identical headers)
          }

          // append data lines
          if (dataLines.length) {
            fs.appendFileSync(masterCsvPath, dataLines.join("\n") + "\n");
          }
        } catch (e) {
          console.warn("master_csv: skipping file", f, e?.message || e);
        }
      }
    }

    // ---------- 3) OTHER TYPES -> create zip per extension (html, png/jpg, txt, etc) ----------
    const otherExts = Object.keys(grouped).filter(e => !["json","csv"].includes(e) && grouped[e].length > 0);

    for (const ext of otherExts) {
      try {
        const files = grouped[ext];
        if (!files || files.length === 0) continue;
        // create sensible zip name
        const zipName = `master_${ext}.zip`;
        const zipPath = path.join(jobDir, zipName);
        // Try to create zip (if archiver present)
        if (archiver) {
          await makeZip(zipPath, files, rowsDir).catch(err => {
            console.warn("zip creation failed for", ext, err?.message || err);
          });
        } else {
          // if archiver not available, copy first file as placeholder so frontend sees something
          // (we won't overwrite existing placeholder)
          if (!fs.existsSync(path.join(jobDir, `master_${ext}.placeholder`))) {
            try {
              fs.writeFileSync(path.join(jobDir, `master_${ext}.placeholder`), `archiver missing, files: ${files.join(",")}`);
            } catch(e){}
          }
        }
      } catch (e) {
        console.warn("creating zip for ext failed:", ext, e?.message || e);
      }
    }

    // Additionally, create a catch-all zip of all non-json/csv files (if archiver available)
    const nonJsonCsvFiles = [];
    for (const ext of otherExts) nonJsonCsvFiles.push(...grouped[ext]);
    if (nonJsonCsvFiles.length > 0 && archiver) {
      try {
        const allZip = path.join(jobDir, "master_files.zip");
        await makeZip(allZip, nonJsonCsvFiles, rowsDir).catch(()=>{});
      } catch (e) {
        // ignore
      }
    }

    // Update DB record: point to jobDir location (master_json exists at least)
    const resultPath = masterJsonPath;
    await job.update({ resultPath, status: "completed", finishedAt: new Date() }).catch(()=>{});

    console.log(`✅ Master outputs created for job ${jobId} in ${jobDir}`);
  } catch (e) {
    console.warn("compileMasterResultsIfComplete error:", e?.message || e);
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