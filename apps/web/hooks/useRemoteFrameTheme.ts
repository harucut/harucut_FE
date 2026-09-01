"use client";

import { useEffect, useState } from "react";
import type { FrameId } from "@/constants/frames";
import { toThemeExportJson } from "@/lib/frameApi";
import { resolveThemeAssetUrls } from "@/lib/frameAssets";
import { getImageUrlByKey } from "@/lib/presignedUploadApi";
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

        // IMAGE 배경은 key만 오므로 렌더용 URL을 해석해 붙인다(실패 시 색 폴백).
        if (
          nextTheme.background?.type === "IMAGE" &&
          nextTheme.background.key &&
          !nextTheme.background.url
        ) {
          const url = await getImageUrlByKey(nextTheme.background.key);
          if (cancelled) return;
          if (url) {
            nextTheme.background = { ...nextTheme.background, url };
          }
        }

        // 컴포넌트 자산도 key 로 저장돼 있어 그릴 주소를 붙여야 한다(배경과 같은 이유).
        const withAssets = await resolveThemeAssetUrls(nextTheme);
        if (cancelled) return;

        setThemeData(withAssets);
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
