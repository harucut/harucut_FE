"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FrameId } from "@/constants/frames";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

export type ThemeDraft = {
  id: string;
  frameId: FrameId;
  name: string;
  savedAt: number;
  data: ThemeExportJson;
};

type ThemeDraftStore = {
  drafts: ThemeDraft[];
  addDraft: (data: ThemeExportJson, opts?: { name?: string }) => string;
  removeDraft: (id: string) => void;
  getDraft: (id: string) => ThemeDraft | undefined;
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useThemeDraftStore = create<ThemeDraftStore>()(
  persist(
    (set, get) => ({
      drafts: [],

      addDraft: (data, opts) => {
        const id = uid();
        const name = opts?.name || `${id}`;

        const draft: ThemeDraft = {
          id,
          frameId: data.frameId,
          name,
          savedAt: Date.now(),
          data,
        };

        set((s) => ({
          drafts: [draft, ...s.drafts].slice(0, 50),
        }));

        return id;
      },

      removeDraft: (id) =>
        set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) })),

      getDraft: (id) => get().drafts.find((d) => d.id === id),
    }),
    {
      name: "theme-drafts",
      version: 1,
    },
  ),
);
