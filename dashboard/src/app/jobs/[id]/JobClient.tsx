// ...existing code...
"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPostForm } from "../../../lib/api";
import FileIcon from "../../../components/FileIcon";
export default function JobClient({ id }: { id: string }) {
  const [job, setJob] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [rowFiles, setRowFiles] = useState<Record<number, string[]>>({});
  async function load() {
    setLoading(true);
    const j = await apiGet(`/jobs/${id}`);
    const lg = await apiGet(`/jobs/${id}/logs`);
    const r = await apiGet(`/jobs/${id}/rows`, true);
    setRows(r.rows || []);
    setJob(j);
    setLogs(lg.logs || []);
    setLoading(false);
  }

  async function loadRowFiles(rowIndex: number) {
    const res = await apiGet(`/jobs/${id}/rows/${rowIndex}/files`);
    setRowFiles((prev) => ({ ...prev, [rowIndex]: res.files || [] }));
  }

  useEffect(() => {
    load();

    // const timer = setInterval(() => load(), 3000);
    // return () => clearInterval(timer);
  }, []);
  
  useEffect(() => {
    rows.forEach((r) => {
      if (!rowFiles[r.rowIndex]) {
        loadRowFiles(r.rowIndex);
      }
    });
  }, [rows, rowFiles]);

  if (loading || !job)
    return <div className="p-6">Loading...</div>;

  const progress =
    job.totalItems > 0
      ? Math.round((job.processedRows / job.totalItems) * 100)
      : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Job #{job.id}</h1>

      <div className="border rounded-lg p-4 mb-6 bg-white shadow-sm">
        <p><b>Status:</b> {job.status}</p>
        <p><b>Total Rows:</b> {job.totalItems}</p>
        <p><b>Processed:</b> {job.processedRows}</p>
        <p><b>Success:</b> {job.successCount}</p>
        <p><b>Failed:</b> {job.failedCount}</p>

        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="mt-1 text-sm text-gray-600">{progress}% complete</p>
        </div>

        <a
          className="inline-block mt-4 px-4 py-2 bg-green-600 text-white rounded-md"
          href={`${process.env.NEXT_PUBLIC_API_URL}/jobs/${id}/results`}
          target="_blank"
        >
          Download results.csv
        </a>
      </div>
      
      <button
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-md"
        onClick={load}
      >
        Refresh
      </button>
      {/* ROW LOGS */}

      {/* <h2 className="text-2xl font-semibold mb-2">Row Logs</h2>

      {logs.length === 0 ? (
        <p className="text-gray-500">No logs yet</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li key={log}>
              <a
                className="text-blue-600 underline"
                href={`${process.env.NEXT_PUBLIC_API_URL}/jobs/${id}/logs/${log}`}
                target="_blank"
              >
                {log}
              </a>
            </li>
          ))}
        </ul>
      )} */}
      {/* ROW RESULTS */}
<h2 className="text-2xl font-semibold mt-6 mb-2">Row Results</h2>

{rows.length === 0 ? (
  <p className="text-gray-500">No rows processed yet…</p>
) : (
  <table className="w-full text-sm border">
    <thead className="bg-gray-100">
      <tr>
        <th className="p-2 border">Row</th>
        <th className="p-2 border">Status</th>
        <th className="p-2 border">JSON</th>
        <th className="p-2 border">Files</th>
        <th className="p-2 border">Log</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => (
        <tr key={r.rowIndex}>
          <td className="border p-2">{r.rowIndex}</td>
          <td className="border p-2">
            {r.status === "done" ? "✅ success" : "⏳ pending"}
          </td>
          <td className="border p-2">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/jobs/${id}/rows/${r.file}`}
              target="_blank"
              className="text-blue-600 underline"
            >
              JSON
            </a>
          </td>
          <td className="p-2 border">
            {rowFiles[r.rowIndex]?.length ? (
              <div className="flex flex-wrap gap-2">
                {rowFiles[r.rowIndex].map((file) => (
                  <a
                    key={file}
                    href={`${process.env.NEXT_PUBLIC_API_URL}/jobs/${id}/rows/${r.rowIndex}/file/${file}`}
                    target="_blank"
                    className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-1 text-sm"
                  >
                    <FileIcon filename={file} />
                    {file}
                  </a>
                ))}
              </div>
            ) : (
              <span className="text-gray-400">No files</span>
            )}
          </td>
          <td className="border p-2">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/jobs/${id}/logs/row_${r.rowIndex}.log`}
              target="_blank"
              className="text-blue-600 underline"
            >
              Log
            </a>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)}
    </div>
  );
}
// ...existing code...