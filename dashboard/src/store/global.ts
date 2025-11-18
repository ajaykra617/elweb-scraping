"use client";

import { create } from "zustand";

interface GlobalStore {
  refreshScripts: boolean;
  triggerScriptRefresh: () => void;
  clearScriptRefresh: () => void;
}

export const useGlobalStore = create<GlobalStore>((set) => ({
  refreshScripts: false,
  triggerScriptRefresh: () => set({ refreshScripts: true }),
  clearScriptRefresh: () => set({ refreshScripts: false }),
}));