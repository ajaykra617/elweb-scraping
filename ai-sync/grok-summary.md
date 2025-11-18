**PERFECT — We're 100% aligned.**  
Your vision is **crystal clear**, and I’m **all in** on the roadmap.

---

## CONFIRMED: Project Scope & Separation

| Component | Status | Notes |
|--------|--------|-------|
| `elweb-scraping` | **Current Project** | API + Queue + Workers + Docker |
| `proxy-manager` | **Separate Project** | REST API for: `GET /rotate`, `GET /healthy`, `POST /add`, etc. |
| **Future Integration** | Planned | `elweb-scraping` calls `proxy-manager` via HTTP |

> **Smart move** — Keeps concerns separated.  
> `proxy-manager` can scale independently (Kubernetes, rate-limiting, health checks).  
> `elweb-scraping` stays lean: **just consumes `/rotate`**.

---

## NEXT PHASE: **Dashboard + CSV Upload + Concurrency Control**

Let’s build a **user-facing web dashboard** where:

1. **Registered users log in**
2. **Upload CSV** (e.g., `urls.csv`)
3. **Set concurrency** (e.g., “Scrape 50 URLs at once”)
4. **See live job status + download results**

---

# GROK PROPOSAL: Dashboard MVP (v7)

```mermaid
flowchart TD
    A[User] --> B[Dashboard (React/Vite)]
    B --> C[API /upload (Express)]
    C --> D[Parse CSV → N URLs]
    D --> E[Split into Batches (size = concurrency)]
    E --> F[queue.add() → BullMQ]
    F --> G[Node Worker → proxy-manager → scrape]
    G --> H[Save result → storage/results/]
    H --> I[Update Job status in DB]
    B --> J[Live poll /jobs/:id]
```

---

## 1. Tech Stack (Fast & Familiar)

| Layer | Tech |
|------|------|
| **Frontend** | React + Vite + TailwindCSS |
| **Backend** | Existing Express API |
| **Auth** | JWT (add to `auth.db.js`) |
| **File Upload** | `multer` + `csv-parser` |
| **Realtime** | Server-Sent Events (SSE) or WebSocket (later) |

---

## 2. New Files to Add (Copy-Paste Ready)

### `src/api/routes/dashboard.js` (New)

```js
// src/api/routes/dashboard.js
import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { queue } from '../../queue/queue.js';
import Job from '../models/Job.js';

const router = express.Router();
const upload = multer({ dest: 'storage/uploads/' });

// Upload CSV + start job
router.post('/upload', upload.single('file'), async (req, res) => {
  const { userId, concurrency = 5 } = req.body;
  if (!req.file || !userId) return res.status(400).json({ error: 'file and userId required' });

  const urls = [];
  const inputPath = req.file.path;

  // Parse CSV
  await new Promise((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(csv())
      .on('data', (row) => {
        if (row.url) urls.push(row.url.trim());
      })
      .on('end', resolve)
      .on('error', reject);
  });

  fs.unlinkSync(inputPath); // cleanup

  // Create job
  const job = await Job.create({
    userId,
    inputFile: req.file.originalname,
    totalItems: urls.length,
    status: 'queued',
    startedAt: new Date(),
  });

  // Split into batches
  const batchSize = parseInt(concurrency);
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    await queue.add('scrape-batch', {
      jobId: job.id,
      urls: batch,
      lang: 'playwright', // or 'node'
    });
  }

  res.json({ jobId: job.id, total: urls.length, concurrency: batchSize });
});

export default router;
```

---

### Mount in `server.js`

```js
// Add after other routes
import dashboardRouter from './routes/dashboard.js';
app.use('/dashboard', dashboardRouter);
```

---

### `src/workers/node/worker.js` –**Batch Support**

```js
worker.on('scrape-batch', async (job) => {
  const { jobId, urls } = job.data;
  let success = 0, failed = 0;

  await Promise.all(urls.map(async (url) => {
    const proxyRes = await fetch('http://proxy-manager:3000/rotate');
    const { proxy } = await proxyRes.json();

    const result = await scrapeWithProxy(url, { proxy }); // from lib/scraper.js
    if (result.success) success++; else failed++;

    // Save per-URL result
    fs.appendFileSync(path.join(RESULTS_PATH, `${jobId}.csv`), `${url},${result.success}\n`);
  }));

  // Update job
  await fetch(`http://api:8000/api/job/${jobId}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed', successCount: success, failedCount: failed })
  });
});
```

---

## 3. Dashboard UI (React Snippet)

```tsx
// Dashboard.tsx
const [file, setFile] = useState(null);
const [concurrency, setConcurrency] = useState(5);

const handleUpload = async () => {
  const form = new FormData();
  form.append('file', file);
  form.append('userId', user.id);
  form.append('concurrency', concurrency);

  const res = await fetch('/dashboard/upload', { method: 'POST', body: form });
  const { jobId } = await res.json();
  navigate(`/job/${jobId}`);
};
```

---

## 4. Proxy Manager Integration (Future)

```js
// In scraper.js
const proxyRes = await fetch('http://proxy-manager:3000/rotate');
const { proxy } = await proxyRes.json();
```

→ Just **one HTTP call** per request.

---

## Your Action Plan (Do This Now)

1. **Save my analysis** → `ai-sync/grok-summary.md`
2. **Get ChatGPT & Copilot responses** → save as:
   - `ai-sync/chatgpt-summary.md`
   - `ai-sync/copilot-summary.md`
3. **Create `next-steps.md`**

```markdown
# NEXT STEPS (v7 Dashboard)

- [ ] Add `multer`, `csv-parser` to `package.json`
- [ ] Create `src/api/routes/dashboard.js`
- [ ] Add batch job type in worker
- [ ] Build React dashboard (Vite)
- [ ] Add JWT auth
- [ ] Link to `proxy-manager` later
```

4. **Reply here with**:
> “ChatGPT + Copilot synced. Let’s build the dashboard!”

---

## Final Vision

```
User → Dashboard → Upload CSV → Set Concurrency → Job Queued
        ↓
   BullMQ → Node Worker → proxy-manager → Playwright → Scrape
        ↓
   Results CSV + Live Status
```

**You’re building the next ZenRows — with full control.**

**Drop ChatGPT/Copilot responses → let’s code the dashboard.**  
**We’re live.**