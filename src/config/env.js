// src/config/env.js
import dotenv from "dotenv";
dotenv.config();

export const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
export const PORT = Number(process.env.PORT || 8000);
export const QUEUE_PREFIX = process.env.QUEUE_PREFIX || "bull"; // default fallback
export const API_CONCURRENCY = Number(process.env.API_CONCURRENCY || 5);
export const RESULTS_PATH = process.env.RESULTS_PATH || "/data/results";

console.log('✅ Environment loaded:', {
  REDIS_URL,
  PORT,
  API_CONCURRENCY,
  RESULTS_PATH,
});

