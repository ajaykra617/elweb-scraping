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
