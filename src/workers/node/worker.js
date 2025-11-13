import pkg from 'bullmq';
import IORedis from 'ioredis';
import { REDIS_URL, RESULTS_PATH, API_CONCURRENCY } from '../../config/env.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const { Worker } = pkg;

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

console.log('🔧 Loaded REDIS_URL:', REDIS_URL);

const worker = new Worker('scrape', async job => {
  const { lang, script, args } = job.data;
  console.log(`[node-worker] job ${job.id} script=${script} lang=${lang}`);

  fs.mkdirSync(RESULTS_PATH, { recursive: true });
  const outFile = path.join(RESULTS_PATH, `${job.id}.log`);
  const outStream = fs.createWriteStream(outFile, { flags: 'a' });

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
  });
  proc.stderr.on('data', d => {
    outStream.write(d);
    process.stderr.write(d);
  });

  return new Promise((resolve, reject) => {
    proc.on('close', code => {
      console.log(`[node-worker] job ${job.id} finished code=${code}`);
      outStream.end();
      resolve({ code });
    });
    proc.on('error', err => {
      console.error('[node-worker] spawn error', err);
      outStream.end();
      reject(err);
    });
  });
}, { connection, concurrency: API_CONCURRENCY });

worker.on('failed', (job, err) => {
  console.error(`[node-worker] job ${job.id} failed:`, err);
});

console.log('Node worker started and listening for jobs...');
