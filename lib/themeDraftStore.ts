"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FrameId } from "@/constants/frames";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

/**
 * 테마 에디터 결과를 로컬에 저장하는 Draft 구조
 */
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
  updateDraft: (
    id: string,
    data: ThemeExportJson,
    opts?: { name?: string },
  ) => string | null;
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

      updateDraft: (id, data, opts) => {
        const current = get().drafts.find((d) => d.id === id);
        if (!current) return null;

        const next: ThemeDraft = {
          ...current,
          frameId: data.frameId,
          data,
          name: opts?.name ?? id,
          savedAt: Date.now(),
        };

        set((s) => ({
          drafts: s.drafts.map((d) => (d.id === id ? next : d)),
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
