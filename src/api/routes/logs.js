import express from 'express';
import fs from 'fs';
import path from 'path';
import { RESULTS_PATH } from '../../config/env.js';

const router = express.Router();

// Get full log file for jobId
router.get('/:jobId', async (req, res) => {
  const jobId = req.params.jobId;
  const filePath = path.join(RESULTS_PATH, `${jobId}.log`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'log not found' });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// Tail last N lines (simple, small file approach)
router.get('/:jobId/tail', async (req, res) => {
  const jobId = req.params.jobId;
  const lines = parseInt(req.query.lines || '200', 10);
  const filePath = path.join(RESULTS_PATH, `${jobId}.log`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'log not found' });
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const parts = content.split(/\r?\n/).filter(Boolean);
    const tail = parts.slice(-lines).join('\n');
    res.json({ jobId, lines: tail.split(/\r?\n/), totalLines: parts.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
