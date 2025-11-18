"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import Link from "next/link";

export default function UserStatus() {
  const [user, setUser] = useState<any>(null);

  async function load() {
    const res = await apiGet("/auth/me");
    if (res && !res.error) setUser(res);
  }

  async function logout() {
    await apiPost("/auth/logout", {});
    window.location.href = "/auth/login";
  }

  useEffect(() => {
    load();
  }, []);

  if (!user) {
    return (
      <div className="text-center text-sm text-gray-500">
        Not logged in
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm mb-2">
        <span className="font-semibold">{user.name}</span>
        <br />
        <span className="text-gray-500">{user.email}</span>
      </div>

      <button
        onClick={logout}
        className="px-3 py-2 bg-red-500 text-white rounded w-full"
      >
        Logout
      </button>
    </div>
  );
}