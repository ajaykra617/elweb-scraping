import pkg from 'bullmq';
import IORedis from 'ioredis';
import { REDIS_URL } from '../config/env.js';

const { Queue, QueueScheduler } = pkg;

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// create queue
export const queue = new Queue('scrape', { connection });

// create scheduler robustly (works across BullMQ versions)
let scheduler;
if (typeof QueueScheduler === 'function') {
  try {
    scheduler = new QueueScheduler('scrape', { connection });
  } catch (e) {
    // if factory style
    scheduler = QueueScheduler('scrape', { connection });
  }
} else if (QueueScheduler?.default) {
  try {
    scheduler = new QueueScheduler.default('scrape', { connection });
  } catch (e) {
    scheduler = QueueScheduler.default('scrape', { connection });
  }
}

if (scheduler?.waitUntilReady) {
  await scheduler.waitUntilReady();
}

console.log('✅ Queue + Scheduler ready using Redis:', REDIS_URL);

export default queue;
