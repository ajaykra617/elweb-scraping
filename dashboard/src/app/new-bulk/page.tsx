"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPostForm } from "../../lib/api";

export default function NewBulkJobPage() {
  const [scripts, setScripts] = useState<any[]>([]);
  const [scriptId, setScriptId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [chunkSize, setChunkSize] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load available scripts
  useEffect(() => {
    async function load() {
      const res = await apiGet("/api/scripts/list");
      if (res.scripts) setScripts(res.scripts);
    }
    load();
  }, []);

  async function submit(e: any) {
    e.preventDefault();
    setError("");

    if (!file) return setError("Please upload a CSV file");
    if (!scriptId) return setError("Please select a script");

    setLoading(true);

    const form = new FormData();
    form.append("inputFile", file);
    form.append("script_id", scriptId);
    form.append("chunkSize", chunkSize.toString());

    const res = await apiPostForm("/jobs/create-bulk", form);

    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    // Redirect to job page
    window.location.href = `/jobs/${res.jobId}`;
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold mb-6">New Bulk Job</h1>

      {error && (
        <div className="bg-red-200 text-red-800 px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        {/* Script selection */}
        <div>
          <label className="block font-semibold mb-1">Select Script</label>
          <select
            className="border p-2 rounded w-full"
            value={scriptId}
            onChange={(e) => setScriptId(e.target.value)}
          >
            <option value="">-- Choose Script --</option>
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.language})
              </option>
            ))}
          </select>
        </div>

        {/* CSV Upload */}
        <div>
          <label className="block font-semibold mb-1">CSV File</label>
          <input
            type="file"
            accept=".csv"
            className="border p-2 rounded w-full"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        {/* Chunk Size */}
        <div>
          <label className="block font-semibold mb-1">Chunk Size</label>
          <input
            type="number"
            className="border p-2 rounded w-full"
            value={chunkSize}
            onChange={(e) => setChunkSize(Number(e.target.value))}
          />
          <small className="text-gray-600">
            Controls how many rows are bundled into each Redis bulk push. Default: 1000
          </small>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md"
        >
          {loading ? "Starting..." : "Start Bulk Job"}
        </button>
      </form>
    </div>
  );
}