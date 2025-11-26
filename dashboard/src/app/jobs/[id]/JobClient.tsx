"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPostForm, apiPost } from "../../../lib/api";
import FileIcon from "../../../components/FileIcon";

export default function JobClient({ id }: { id: string }) {
  const [job, setJob] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [rowFiles, setRowFiles] = useState<Record<number, string[]>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const LIMIT = 23;
  const [resultFiles, setResultFiles] = useState<string[]>([]);

  async function load(jobPage = page, status = statusFilter) {
    setLoading(true);
    const j = await apiGet(`/jobs/${id}`);
    const lg = await apiGet(`/jobs/${id}/logs`);
    const filesRes = await apiGet(`/jobs/${id}/files`);
    setResultFiles(filesRes.files?.map((f:any) => f.name) || []);
    // request rows paginated with status
    const r = await apiGet(`/jobs/${id}/rows?page=${jobPage}&limit=${LIMIT}&status=${status}`, true);
    setRows(r.rows || []);
    setTotalPages(r.totalPages || 1);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rows.forEach((r) => {
      if (!rowFiles[r.rowIndex]) {
        loadRowFiles(r.rowIndex);
      }
    });
  }, [rows, rowFiles]);

  async function onAbort() {
    if (!confirm("Abort this job? This will stop remaining rows and mark them as failed.")) return;
    try {
      await apiPost(`/jobs/${id}/abort`, {});
      // refresh
      await load(1, statusFilter);
    } catch (e) {
      alert("Abort failed: " + (e?.message || e));
    }
  }

  async function setFilterAndLoad(s: string) {
    setStatusFilter(s);
    setPage(1);
    await load(1, s);
  }

  async function goToPage(p: number) {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    await load(p, statusFilter);
  }

  if (loading || !job) return <div className="p-6">Loading...</div>;

  const progress = job.totalItems > 0 ? Math.round((job.processedRows / job.totalItems) * 100) : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Job #{job.id}</h1>

      <div className="border rounded-lg p-4 mb-6 bg-white shadow-sm">
        <p><b>Status:</b> {job.status}</p>
        <p><b>Total Rows:</b> {job.totalItems}</p>
        <p><b>Processed:</b> {job.processedRows}</p>
        <p><b>Success:</b> {job.successCount}</p>
        <p><b>Failed:</b> {job.failedCount}</p>
        <div className="mt-4 flex gap-2 items-center">
 {/* RESULT FILES SECTION */}
<h2 className="text-2xl font-semibold mt-8 mb-4">Result Files</h2>

{resultFiles.length === 0 ? (
  <div className="p-4 bg-gray-50 border rounded text-gray-500">
    No result files yet. They will appear here once the job produces output.
  </div>
) : (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {resultFiles.map((fname) => (
      <a
        key={fname}
        href={`${process.env.NEXT_PUBLIC_API_URL}/jobs/${id}/file/${fname}`}
        target="_blank"
        className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition flex items-center gap-3"
      >
        <div className="w-10 h-10 bg-blue-100 text-blue-600 flex items-center justify-center rounded">
          📄
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900">{fname}</p>
          <p className="text-xs text-gray-500">Click to download</p>
        </div>
      </a>
    ))}
  </div>
)}

  {/* Abort */}
  <button
    className={`px-4 py-2 rounded-md text-white ${
      job.status === "running" || job.status === "queued"
        ? "bg-red-600 hover:bg-red-700 cursor-pointer"
        : "bg-gray-400 cursor-not-allowed"
    }`}
    onClick={() => {
      if (job.status === "running" || job.status === "queued") onAbort();
    }}
    disabled={!(job.status === "running" || job.status === "queued")}
  >
    Abort Job
  </button>

  {/* Refresh */}
  <button
    className="px-4 py-2 bg-gray-200 text-black rounded-md"
    onClick={() => load(page, statusFilter)}
  >
    Refresh
  </button>
</div>


        
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <span>Filter:</span>
        {["all","success","failed","pending"].map(s => (
          <button key={s} className={`px-3 py-1 rounded ${statusFilter===s ? "bg-blue-600 text-white" : "bg-gray-100"}`} onClick={() => setFilterAndLoad(s)}>
            {s}
          </button>
        ))}
      </div>

      {/* ROW RESULTS */}
      <h2 className="text-2xl font-semibold mt-6 mb-2">Row Results (page {page} / {totalPages})</h2>

      {rows.length === 0 ? (
        <p className="text-gray-500">No rows on this page.</p>
      ) : (
        <>
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
                  <td className="border p-2">{r.status === "success" ? "✅ success" : r.status === "failed" ? "❌ failed" : "⏳ pending"}</td>
                  <td className="border p-2">
                    <a href={`${process.env.NEXT_PUBLIC_API_URL}/jobs/${id}/rows/${r.file}`} target="_blank" className="text-blue-600 underline">JSON</a>
                  </td>
                  <td className="p-2 border">
                    {rowFiles[r.rowIndex]?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {rowFiles[r.rowIndex].map((file) => (
                          <a key={file} href={`${process.env.NEXT_PUBLIC_API_URL}/jobs/${id}/rows/${r.rowIndex}/file/${file}`} target="_blank" className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-1 text-sm">
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
                    <a href={`${process.env.NEXT_PUBLIC_API_URL}/jobs/${id}/logs/row_${r.rowIndex}.log`} target="_blank" className="text-blue-600 underline">Log</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* pagination controls */}
          <div className="mt-4 flex items-center gap-2">
            <button className="px-3 py-1 bg-gray-100 rounded" onClick={() => goToPage(1)} disabled={page===1}>First</button>
            <button className="px-3 py-1 bg-gray-100 rounded" onClick={() => goToPage(page-1)} disabled={page===1}>Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button className="px-3 py-1 bg-gray-100 rounded" onClick={() => goToPage(page+1)} disabled={page===totalPages}>Next</button>
            <button className="px-3 py-1 bg-gray-100 rounded" onClick={() => goToPage(totalPages)} disabled={page===totalPages}>Last</button>
          </div>
        </>
      )}
    </div>
  );
}