// app/jobs/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "../../lib/api";
import { useAuthStore } from "../../store/auth";

export default function JobsPage() {
  const user = useAuthStore((s) => s.user);
  const loadingAuth = useAuthStore((s) => s.loading);

  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loadingJobs, setLoadingJobs] = useState(false);

  async function loadJobs() {
    setLoadingJobs(true);
    try {
      const res = await apiGet("/jobs", true); // no-cache
      if (res?.error) {
        setError(res.error || "Unauthorized");
        setJobs([]);
      } else {
        setJobs(res || []);
        setError("");
      }
    } catch (e) {
      setError("Failed to load jobs");
    }
    setLoadingJobs(false);
  }

  // load when auth resolved AND user is present
  useEffect(() => {
    if (loadingAuth) return; // wait
    if (!user) {
      setJobs([]);
      setError("Unauthorized");
      return;
    }
    // user exists -> load jobs
    loadJobs();
  }, [user, loadingAuth]);

  if (loadingAuth) {
    return <div className="p-6">Checking session...</div>;
  }

  if (!user) {
    // user not logged in
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Authorization Required</h1>

        <p className="text-red-600 mb-4">
          You must be logged in to view your jobs.
        </p>

        <Link href="/auth/login" className="px-4 py-2 bg-blue-600 text-white rounded">
          Login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Jobs</h1>

        <Link href="/new-bulk" className="px-4 py-2 bg-blue-600 text-white rounded">
          New Bulk Job
        </Link>
      </div>

      {loadingJobs ? (
        <p>Loading jobs...</p>
      ) : jobs.length === 0 ? (
        <p className="text-gray-500">No jobs found</p>
      ) : (
        <div className="space-y-4">
          {jobs.map((job: any) => (
            <div key={job.id} className="border rounded p-4 bg-white shadow-sm">
              <h2 className="text-xl font-semibold">{job.script?.name}</h2>
              <p>ID: {job.id}</p>
              <p>
                {job.processedRows}/{job.totalItems} processed
              </p>

              <Link href={`/jobs/${job.id}`} className="text-blue-600 underline">
                View Job
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}