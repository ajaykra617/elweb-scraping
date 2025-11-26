import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import queue from '../queue/queue.js';
import { PORT, REDIS_URL } from '../config/env.js';
import IORedis from 'ioredis';
import sequelize from './db.js';
// mount DB-backed routes
import cors from 'cors';
import authRoutes from './routes/auth.db.js';
import jobDbRoutes from './routes/jobs.db.js';
import logsRoutes from './routes/logs.js';
import cookieParser from "cookie-parser";
import scriptRoutes from "./routes/scripts.js";


// Wait for DB sync before starting server
sequelize.sync({ alter: true })
  .then(() => {
    console.log("📦 Database synced successfully");
  })
  .catch((err) => {
    console.error("❌ Database sync failed:", err);
  });
const app = express();

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://20.64.237.238:3000"
  ],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());
// mount routes
app.use("/api/scripts", scriptRoutes);
app.use('/auth', authRoutes);
app.use('/jobs', jobDbRoutes);
app.use('/logs', logsRoutes);

// test redis connection (publisher/subscriber will be used for logs)
const redisPub = new IORedis(REDIS_URL);
const redisSub = new IORedis(REDIS_URL);
redisPub.on('connect', () => console.log('✅ Connected to Redis (pub) at', REDIS_URL));
redisPub.on('error', err => console.error('❌ Redis pub error:', err));
redisSub.on('connect', () => console.log('✅ Connected to Redis (sub) at', REDIS_URL));
redisSub.on('error', err => console.error('❌ Redis sub error:', err));

// basic health endpoint
app.get('/', (req, res) => res.send('🚀 elweb-scraping API is running!'));

app.get('/test/node', async (req, res) => {
  try {
    const job = await queue.add('scrape', { lang: 'node', script: 'src/tests/test_node.js', args: {} });
    res.json({ status: 'queued', jobId: job.id, lang: 'node' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/test/python', async (req, res) => {
  try {
    const job = await queue.add('scrape', { lang: 'python', script: 'src/tests/test_python.py', args: {} });
    res.json({ status: 'queued', jobId: job.id, lang: 'python' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/job', async (req, res) => {
  // Create queue job and also create DB Job entry (if userId supplied)
  const { lang = 'node', script, args = {}, userId = null, inputFile = null, totalItems = null } = req.body;
  if (!script) return res.status(400).json({ error: 'script required' });
  try {
    // Add to queue
    const qjob = await queue.add('scrape', { lang, script, args });

    // If DB is available, create a Job row to track it
    try {
      // require lazily to avoid startup order issues
      const Job = (await import('./models/Job.js')).default;
      const dbJob = await Job.create({
        // job.id in DB is allowed to be string in your setup — store queue id as id
        id: qjob.id,
        userId: userId || null,
        inputFile,
        totalItems,
        status: 'queued',
        startedAt: new Date()
      });
      res.json({ status: 'queued', jobId: qjob.id, dbJobId: dbJob.id });
    } catch (dbErr) {
      // DB might not be ready — still return the queue id
      console.warn('Warning: creating DB job failed:', dbErr.message || dbErr);
      res.json({ status: 'queued', jobId: qjob.id });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create HTTP server and attach a WebSocket server for logs relay
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/logs' });

// Connected WS clients (map jobId -> Set of ws)
const clientsByJob = new Map();

wss.on('connection', (ws, req) => {
  // Expect query ?jobId=...
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const jobId = url.searchParams.get('jobId') || null;
    if (!jobId) {
      ws.send(JSON.stringify({ error: 'missing jobId query param' }));
      ws.close();
      return;
    }
    const set = clientsByJob.get(jobId) || new Set();
    set.add(ws);
    clientsByJob.set(jobId, set);

    ws.on('close', () => {
      const s = clientsByJob.get(jobId);
      if (s) {
        s.delete(ws);
        if (s.size === 0) clientsByJob.delete(jobId);
      }
    });
  } catch (e) {
    ws.send(JSON.stringify({ error: 'invalid connection' }));
    ws.close();
  }
});

// Subscribe to Redis pattern for logs: channel name "logs:{jobId}"
redisSub.psubscribe('logs:*', err => {
  if (err) console.error('Redis psubscribe error:', err);
});

redisSub.on('pmessage', (pattern, channel, message) => {
  try {
    const parts = channel.split(':'); // logs:{jobId}
    const jobId = parts.slice(1).join(':');
    const clients = clientsByJob.get(jobId);
    if (clients && clients.size) {
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }
  } catch (e) {
    console.warn('Error relaying log message', e);
  }
});

server.listen(PORT, () => console.log(`🚀 API server running on port ${PORT}`));
