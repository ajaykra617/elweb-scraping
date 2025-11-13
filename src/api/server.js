import express from 'express';
import queue from '../queue/queue.js';
import { PORT } from '../config/env.js';
import IORedis from 'ioredis';
import { REDIS_URL } from '../config/env.js';

const app = express();
app.use(express.json());

// test redis connection
const r = new IORedis(REDIS_URL);
r.on('connect', () => console.log('✅ Connected to Redis at', REDIS_URL));
r.on('error', err => console.error('❌ Redis error:', err));

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
  const { lang='node', script, args={} } = req.body;
  if (!script) return res.status(400).json({ error: 'script required' });
  try {
    const job = await queue.add('scrape', { lang, script, args });
    res.json({ status: 'queued', jobId: job.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`🚀 API server running on port ${PORT}`));
