// app/sidebar-client.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../store/auth";

export default function SidebarClient() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    // one central fetch on mount
    fetchUser();
  }, []);

  async function onLogout() {
    await logout();
    router.push("/auth/login");
  }

  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <h2 className="text-xl font-semibold mb-4">elweb</h2>

        <nav className="space-y-2">
          {loading && <p className="text-sm text-gray-500">Checking auth...</p>}

          {!loading && user && (
            <>
              <Link href="/jobs" className="block px-3 py-2 rounded hover:bg-slate-100">
                Jobs
              </Link>

              <Link href="/new-bulk" className="block px-3 py-2 rounded hover:bg-slate-100">
                New Job
              </Link>

              <Link href="/scripts" className="block px-3 py-2 rounded hover:bg-slate-100">
                Scripts
              </Link>
            </>
          )}

          {!loading && !user && (
            <Link href="/auth/login" className="block px-3 py-2 rounded hover:bg-slate-100">
              Login
            </Link>
          )}
        </nav>
      </div>

      {!loading && user && (
        <div>
          <p className="text-sm font-semibold">{user.email || user.name || "User"}</p>

          <button
            onClick={onLogout}
            className="mt-3 px-3 py-2 bg-red-500 text-white rounded w-full"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}