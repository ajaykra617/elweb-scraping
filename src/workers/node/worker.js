import pkg from 'bullmq';
import IORedis from 'ioredis';
import { REDIS_URL, RESULTS_PATH, API_CONCURRENCY } from '../../config/env.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const { Worker } = pkg;

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const redisPub = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

console.log('🔧 Loaded REDIS_URL:', REDIS_URL);

const worker = new Worker('scrape', async job => {
  const { lang, script, args } = job.data;
  console.log(`[node-worker] job ${job.id} script=${script} lang=${lang}`);

  fs.mkdirSync(RESULTS_PATH, { recursive: true });
  const outFile = path.join(RESULTS_PATH, `${job.id}.log`);
  const outStream = fs.createWriteStream(outFile, { flags: 'a' });

  // Attempt to import Job model so worker can update DB job status. If DB not available, continue.
  let JobModel = null;
  try {
    JobModel = (await import('../../api/models/Job.js')).default;
  } catch (e) {
    console.warn('Warning: Job model not available in worker:', e.message || e);
  }

  // helper to publish a log line to Redis channel: logs:{jobId}
  const publishLog = (buffer) => {
    try {
      const line = buffer.toString();
      redisPub.publish(`logs:${job.id}`, JSON.stringify({ jobId: job.id, line, ts: Date.now() }));
    } catch (e) {
      // ignore publish errors
    }
  };

  // set job started in DB if possible
  if (JobModel) {
    try {
      await JobModel.update({ status: 'running', startedAt: new Date() }, { where: { id: job.id } });
    } catch (e) {
      console.warn('Could not update JobModel to running:', e.message || e);
    }
  }

  let cmd, cmdArgs;
  if (lang === 'python' || script.endsWith('.py')) {
    cmd = 'python';
    cmdArgs = [script, ...Object.values(args || {})];
  } else {
    cmd = 'node';
    cmdArgs = [script, ...Object.values(args || {})];
  }

  const proc = spawn(cmd, cmdArgs, { shell: true });

  proc.stdout.on('data', d => {
    outStream.write(d);
    process.stdout.write(d);
    publishLog(d);
  });
  proc.stderr.on('data', d => {
    outStream.write(d);
    process.stderr.write(d);
    publishLog(d);
  });

  return new Promise((resolve, reject) => {
    proc.on('close', async code => {
      console.log(`[node-worker] job ${job.id} finished code=${code}`);
      outStream.end();

      // Update DB job status depending on exit code
      if (JobModel) {
        try {
          const status = code === 0 ? 'completed' : 'failed';
          await JobModel.update({
            status,
            finishedAt: new Date()
          }, { where: { id: job.id } });
        } catch (e) {
          console.warn('Could not update JobModel after completion:', e.message || e);
        }
      }

      resolve({ code });
    });
    proc.on('error', err => {
      console.error('[node-worker] spawn error', err);
      outStream.end();
      if (JobModel) {
        try {
          JobModel.update({ status: 'failed', finishedAt: new Date() }, { where: { id: job.id } });
        } catch (e) {}
      }
      reject(err);
    });
  });
}, { connection, concurrency: API_CONCURRENCY });

worker.on('failed', (job, err) => {
  console.error(`[node-worker] job ${job.id} failed:`, err);
});

console.log('Node worker started and listening for jobs...');
