"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPostForm } from "../../../lib/api";
import { useRouter } from "next/navigation";

export default function NewBulkJob() {
  const router = useRouter();

  const [scripts, setScripts] = useState<any[]>([]);
  const [scriptId, setScriptId] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [chunkSize, setChunkSize] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load available scripts
  useEffect(() => {
    apiGet("/api/scripts/list")
      .then((res) => setScripts(res.scripts || []))
      .catch(() => setScripts([]));
  }, []);

  const submitJob = async () => {
    setError("");

    if (!csvFile) return setError("Please upload a CSV file.");
    if (!scriptId) return setError("Please select a script.");

    const form = new FormData();
    form.append("inputFile", csvFile);
    form.append("script_id", scriptId);
    form.append("chunkSize", chunkSize);
    form.append("userId", "1"); // TODO: dynamic user auth later

    setLoading(true);

    try {
      const res = await apiPostForm("/jobs/create-bulk", form);

      if (res.success && res.jobId) {
        router.push(`/jobs/${res.jobId}`);
      } else {
        setError("Unexpected server response.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to start job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Create Bulk Job</h1>

      {error && (
        <div className="bg-red-200 text-red-800 p-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Script Selector */}
      <div className="mb-4">
        <label className="font-medium block mb-1">Select Script</label>
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
      <div className="mb-4">
        <label className="font-medium block mb-1">Upload CSV</label>
        <input
          type="file"
          accept=".csv"
          className="border p-2 rounded w-full"
          onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
        />
      </div>

      {/* Chunk Size */}
      <div className="mb-4">
        <label className="font-medium block mb-1">Chunk Size</label>
        <input
          type="number"
          value={chunkSize}
          onChange={(e) => setChunkSize(e.target.value)}
          className="border p-2 rounded w-full"
        />
      </div>

      {/* Submit */}
      <button
        onClick={submitJob}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded"
      >
        {loading ? "Starting Job..." : "Start Bulk Job"}
      </button>
    </div>
  );
}