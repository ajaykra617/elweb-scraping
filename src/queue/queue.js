// src/queue/queue.js
import pkg from "bullmq";
import IORedis from "ioredis";
import { REDIS_URL, QUEUE_PREFIX } from "../config/env.js";

const { Queue, QueueScheduler } = pkg;
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// main scrape queue (used by API test endpoints)
const queue = new Queue("scrape", {
  connection,
  prefix: QUEUE_PREFIX
});

// scheduler init
(async function initScheduler() {
  try {
    let scheduler;
    if (typeof QueueScheduler === "function") {
      scheduler = new QueueScheduler("scrape", { connection, prefix: QUEUE_PREFIX });
    } else if (QueueScheduler?.default) {
      scheduler = new QueueScheduler.default("scrape", { connection, prefix: QUEUE_PREFIX });
    } else {
      console.warn("QueueScheduler not found in bullmq package");
    }

    if (scheduler && scheduler.waitUntilReady) {
      await scheduler.waitUntilReady();
    }
    console.log("✅ Queue + Scheduler ready using Redis:", REDIS_URL, "Prefix:", QUEUE_PREFIX);
  } catch (e) {
    console.error("Queue scheduler init error:", e);
  }
})();

export default queue;