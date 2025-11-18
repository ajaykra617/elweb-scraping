"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPostForm } from "../../lib/api";
import { useGlobalStore } from "../../store/global";

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadScripts() {
    const res = await apiGet("/api/scripts/list");
    if (res.scripts) setScripts(res.scripts);
  }

  useEffect(() => {
    loadScripts();
  }, []);

  async function uploadScript(e: any) {
    e.preventDefault();
    setError("");

    if (!name) return setError("Script name required");
    if (!file) return setError("Please select a script file (.py or .js)");

    const form = new FormData();
    form.append("scriptFile", file);
    form.append("name", name);

    setLoading(true);
    const res = await apiPostForm("/api/scripts/upload", form);
    // const res = await apiPostForm("/api/scripts/upload", formData);

    if (res.success) {
      useGlobalStore.getState().triggerScriptRefresh(); // ← FIX
    }
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    // Reload list
    await loadScripts();
    setFile(null);
    setName("");
  }

  async function deleteScript(id: number) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/scripts/delete/${id}`, {
      method: "DELETE",
      credentials: "include"
    });

    const json = await res.json();
    if (!json.error) loadScripts();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-4">Scripts</h1>

      {/* Upload form */}
      <form onSubmit={uploadScript} className="space-y-4 mb-8">
        {error && (
          <div className="bg-red-200 text-red-800 px-4 py-2 rounded">
            {error}
          </div>
        )}

        <div>
          <label className="block font-semibold mb-1">Script Name</label>
          <input
            type="text"
            className="border p-2 rounded w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Example: amazon_scraper"
          />
        </div>

        <div>
          <label className="block font-semibold mb-1">Script File</label>
          <input
            type="file"
            accept=".py,.js"
            className="border p-2 rounded w-full"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {loading ? "Uploading..." : "Upload Script"}
        </button>
      </form>

      {/* Script List */}
      <h2 className="text-xl font-semibold mb-2">Uploaded Scripts</h2>

      {scripts.length === 0 ? (
        <p className="text-gray-500">No scripts uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {scripts.map((s) => (
            <li
              key={s.id}
              className="border rounded p-3 flex justify-between items-center bg-white shadow-sm"
            >
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-gray-600">{s.file_path}</p>
              </div>

              <button
                className="px-3 py-1 bg-red-500 text-white rounded"
                onClick={() => deleteScript(s.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}