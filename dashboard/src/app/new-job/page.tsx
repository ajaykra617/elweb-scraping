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
