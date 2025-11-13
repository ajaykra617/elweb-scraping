import dotenv from 'dotenv';
dotenv.config();

export const REDIS_URL =
  process.env.REDIS_URL ||
  `redis://${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`;

export const PORT = parseInt(process.env.PORT || '8000', 10);
export const RESULTS_PATH = process.env.RESULTS_PATH || './storage/results';
export const API_CONCURRENCY = parseInt(process.env.API_CONCURRENCY || '3', 10);

console.log('✅ Environment loaded:', {
  REDIS_URL,
  PORT,
  API_CONCURRENCY,
  RESULTS_PATH,
});
