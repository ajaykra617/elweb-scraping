This file is a merged representation of a subset of the codebase, containing files not matching ignore patterns, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching these patterns are excluded: node_modules/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  app/
    auth/
      login/
        page.tsx
      signup/
        page.tsx
    jobs/
      [id]/
        page.tsx
      page.tsx
    new-job/
      page.tsx
    globals.css
    layout.tsx
    page.tsx
  components/
    LogViewer.tsx
  lib/
    api.ts
.env.example
.env.local
dashboard_complete_v2.zip
dashboard_complete_v2.zip:Zone.Identifier
next-env.d.ts
next.config.mjs
package.json
postcss.config.js
README_FRONTEND.md
README.md
tailwind.config.js
tsconfig.json
```

# Files

## File: src/app/auth/login/page.tsx
````typescript
'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // important for httpOnly cookie
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      // login success -> redirect to jobs
      router.push('/jobs');
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-2xl mb-4">Login</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm">Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} className="w-full border px-3 py-2 rounded" />
        </div>
        <div>
          <label className="block text-sm">Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full border px-3 py-2 rounded" />
        </div>
        {error && <div className="text-red-600">{error}</div>}
        <div>
          <button className="px-4 py-2 bg-slate-800 text-white rounded">Login</button>
        </div>
      </form>
      <div className="text-sm mt-3">
        Don't have an account? <a href="/auth/signup" className="text-blue-600">Sign up</a>
      </div>

    </div>
  );
}
````

## File: src/app/auth/signup/page.tsx
````typescript
'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/signup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Signup failed');
        return;
      }

      // Redirect to login after successful signup
      router.push('/auth/login');
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-2xl mb-4">Sign Up</h1>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm">Email</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        {error && <div className="text-red-600">{error}</div>}

        <div>
          <button className="px-4 py-2 bg-slate-800 text-white rounded">
            Create Account
          </button>
        </div>
      </form>

      <div className="text-sm mt-3">
        Already have an account?{' '}
        <a href="/auth/login" className="text-blue-600">
          Login
        </a>
      </div>
    </div>
  );
}
````

## File: src/app/jobs/[id]/page.tsx
````typescript
'use client';
import React, { useEffect, useState } from 'react';
import LogViewer from '../../../components/LogViewer';

export default function JobDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const [job, setJob] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/jobs/${id}`, { credentials: 'include' });
        const data = await res.json();
        setJob(data);
      } catch (e) {}
    })();
  }, [id]);

  return (
    <div>
      <h1 className="text-2xl mb-4">Job {id}</h1>
      <div className="mb-4">
        <strong>Status:</strong> {job?.status || 'unknown'}
      </div>
      <div>
        <h2 className="text-lg mb-2">Live Logs</h2>
        <LogViewer jobId={id} />
      </div>
    </div>
  );
}
````

## File: src/app/jobs/page.tsx
````typescript
'use client';
import React, { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Job = { id: string | number; status: string; createdAt?: string; };

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet('/jobs'); // adjust if your backend has /jobs/user/:id
        if (data.error) { setError(data.error); setLoading(false); return; }
        setJobs(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(e.message || 'Failed');
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div>
      <h1 className="text-2xl mb-4">Jobs</h1>
      {loading && <div>Loading...</div>}
      {error && <div className="text-red-600">{error}</div>}
      <div className="space-y-2">
        {jobs.map(j => (
          <div key={String(j.id)} className="bg-white p-3 rounded shadow">
            <div className="flex justify-between">
              <div>Job {String(j.id)}</div>
              <div className="text-sm">{j.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
````

## File: src/app/new-job/page.tsx
````typescript
'use client';
import React, { useState } from 'react';
import { apiPost } from '../../lib/api';
import { useRouter } from 'next/navigation';

export default function NewJob() {
  const [script, setScript] = useState('src/tests/test_node.js');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiPost('/api/job', { script });
      if (res.error) { setError(res.error); return; }
      // redirect to job detail
      router.push(`/jobs/${res.jobId}`);
    } catch (e: any) {
      setError(e.message || 'Failed');
    }
  }

  return (
    <div className="max-w-xl bg-white p-6 rounded shadow">
      <h1 className="text-2xl mb-4">Create Job</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm">Script</label>
          <input value={script} onChange={e=>setScript(e.target.value)} className="w-full border px-3 py-2 rounded" />
        </div>
        {error && <div className="text-red-600">{error}</div>}
        <div>
          <button className="px-4 py-2 bg-slate-800 text-white rounded">Start Job</button>
        </div>
      </form>
    </div>
  );
}
````

## File: src/app/globals.css
````css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #__next { height: 100%; }
body { @apply bg-slate-50 text-slate-900; }
````

## File: src/app/layout.tsx
````typescript
import './globals.css';
import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'elweb Dashboard',
  description: 'Elweb scraping dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex">
          <aside className="w-64 bg-white border-r p-4">
            <h2 className="text-xl font-semibold mb-4">elweb</h2>
            <nav className="space-y-2">
              <Link href="/jobs" className="block px-3 py-2 rounded hover:bg-slate-100">Jobs</Link>
              <Link href="/new-job" className="block px-3 py-2 rounded hover:bg-slate-100">New Job</Link>
              <Link href="/auth/login" className="block px-3 py-2 rounded hover:bg-slate-100">Login</Link>
            </nav>
          </aside>
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
````

## File: src/app/page.tsx
````typescript
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/jobs');
}
````

## File: src/components/LogViewer.tsx
````typescript
'use client';
import React, { useEffect, useRef, useState } from 'react';

export default function LogViewer({ jobId }: { jobId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const urlBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
    const ws = new WebSocket(`${urlBase}/ws/logs?jobId=${jobId}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const line = msg.line || e.data;
        setLines(prev => [...prev, String(line)]);
      } catch (err) {
        setLines(prev => [...prev, String(e.data)]);
      }
    };
    ws.onclose = () => {};
    return () => { ws.close(); };
  }, [jobId]);

  return (
    <div className="bg-black text-green-200 p-3 rounded h-64 overflow-auto">
      {lines.length === 0 && <div className="text-slate-400">No live logs yet.</div>}
      {lines.map((l, i) => <div key={i} className="whitespace-pre-wrap text-sm">{l}</div>)}
    </div>
  );
}
````

## File: src/lib/api.ts
````typescript
export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function apiGet(path: string) {
  const res = await fetch(`${API}${path}`, { cache: 'no-store', credentials: 'include' });
  return res.json();
}

export async function apiPost(path: string, body: any) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}
````

## File: .env.example
````
NEXT_PUBLIC_API_URL=http://localhost:8000
````

## File: .env.local
````
NEXT_PUBLIC_API_URL=http://localhost:8000
````

## File: next-env.d.ts
````typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/basic-features/typescript for more information.
````

## File: next.config.mjs
````
const nextConfig = { reactStrictMode: true };
export default nextConfig;
````

## File: package.json
````json
{
  "name": "elweb-dashboard",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint --fix"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "18.2.0",
    "react-dom": "18.2.0"
  },
  "devDependencies": {
    "@types/react": "19.2.5",
    "autoprefixer": "^10.4.14",
    "eslint": "8.44.0",
    "eslint-config-next": "14.0.0",
    "postcss": "^8.4.24",
    "tailwindcss": "^3.4.8",
    "typescript": "^5.4.2"
  }
}
````

## File: postcss.config.js
````javascript
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {}, }, };
````

## File: README_FRONTEND.md
````markdown
This dashboard uses httpOnly cookies for auth. Ensure backend sets cookie on /auth/login and /auth/signup. Run `npm install` then `npm run dev`.
````

## File: README.md
````markdown
# elweb Dashboard (Complete)

This is the complete Next.js 14 dashboard scaffold integrated with your backend via httpOnly cookie auth.

Run:

```
cd dashboard
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Login at /auth/login (backend must set httpOnly cookie on /auth/login and /auth/signup).
````

## File: tailwind.config.js
````javascript
export default {
  content: ['./src/**/*.{ts,tsx,js,jsx}'],
  theme: { extend: {}, },
  plugins: [],
};
````

## File: tsconfig.json
````json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": false,
    "forceConsistentCasingInFileNames": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "noEmit": true,
    "types": [
      "node"
    ],
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "src",
    ".next/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
````
