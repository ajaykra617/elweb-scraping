import express from 'express';
import Job from '../models/Job.js';

const router = express.Router();

// Start a new job
router.post('/start', async (req, res) => {
  try {
    const { userId, inputFile, totalItems } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const job = await Job.create({ userId, inputFile, totalItems, status: 'queued', startedAt: new Date() });
    res.json({ status: 'queued', jobId: job.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update job
router.post('/:id/update', async (req, res) => {
  try {
    const { status, successCount, failedCount, resultPath, resultFileName } = req.body;
    const job = await Job.findByPk(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await job.update({
      status,
      successCount,
      failedCount,
      resultPath,
      resultFileName,
      finishedAt: status === 'completed' ? new Date() : job.finishedAt
    });
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const job = await Job.findByPk(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

router.get('/user/:userId', async (req, res) => {
  const jobs = await Job.findAll({ where: { userId: req.params.userId }, order: [['id','DESC']] });
  res.json(jobs);
});

export default router;
