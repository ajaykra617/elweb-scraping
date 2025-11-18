// dashboard/store/auth.ts
"use client";

import { create } from "zustand";

type User = { id: number; email?: string; name?: string } | null;

interface AuthState {
  user: User;
  loading: boolean;
  setUser: (u: User) => void;
  clearUser: () => void;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  setUser: (u) => set({ user: u, loading: false }),
  clearUser: () => set({ user: null, loading: false }),

  fetchUser: async () => {
    set({ loading: true });
    try {
      // call your existing api wrapper (must include credentials)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/me`,
        { method: "GET", credentials: "include", cache: "no-store" }
      );

      const json = await res.json().catch(() => ({ error: "Invalid JSON" }));

      if (!res.ok || json?.error) {
        set({ user: null, loading: false });
      } else {
        // backend returns user object (not {user:...})
        set({ user: json, loading: false });
      }
    } catch (e) {
      set({ user: null, loading: false });
    }
  },

  logout: async () => {
    try {
      // backend /auth/logout expects POST
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});

    } finally {
      set({ user: null, loading: false });
    }
  },

  isAuthenticated: () => !!get().user,
}));