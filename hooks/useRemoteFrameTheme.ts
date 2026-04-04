"use client";

import { useEffect, useState } from "react";
import type { FrameId } from "@/constants/frames";
import { toThemeExportJson } from "@/lib/frameApi";
import { getFrame } from "@/lib/remoteFrameApi";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

export function useRemoteFrameTheme(
  remoteFrameId: number | null | undefined,
  expectedFrameId?: FrameId | null,
) {
  const [themeData, setThemeData] = useState<ThemeExportJson | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      if (!remoteFrameId) {
        setThemeData(null);
        return;
      }

      try {
        const frame = await getFrame(remoteFrameId);
        if (cancelled) return;

        const nextTheme = toThemeExportJson(frame);
        if (expectedFrameId && nextTheme.frameId !== expectedFrameId) {
          setThemeData(null);
          return;
        }

        setThemeData(nextTheme);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setThemeData(null);
        }
      }
    }

    void loadTheme();

    return () => {
      cancelled = true;
    };
  }, [expectedFrameId, remoteFrameId]);

  return themeData;
}
