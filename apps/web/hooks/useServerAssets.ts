"use client";

import { useEffect, useState } from "react";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { listAllFrames } from "@/lib/remoteFrameApi";
import { toServerAssetCatalog, type ServerAssetCatalog } from "@/lib/serverAssets";

const EMPTY: ServerAssetCatalog = { stickers: [], backgrounds: [] };
// 시스템 자산만 보관한다. 서명 URL(24시간)이 만료되기 전에 목록을 다시 받는다.
let cache: { value: ServerAssetCatalog; expires: number } | null = null;
let pending: Promise<ServerAssetCatalog> | null = null;
function loadCatalog() {
  if (cache && cache.expires > Date.now()) return Promise.resolve(cache.value);
  pending ??= listAllFrames()
    .then((frames) => {
      const value = toServerAssetCatalog(frames);
      cache = { value, expires: Date.now() + 20 * 60 * 1000 };
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useServerAssets() {
  const guest = useGuestTrialStore((s) => s.accessMode === "guest");
  const [catalog, setCatalog] = useState(EMPTY);
  useEffect(() => {
    if (guest) return;
    let cancelled = false;
    void loadCatalog()
      .then((value) => {
        if (!cancelled) setCatalog(value);
      })
      .catch(() => {
        // 기본 소재는 계속 쓸 수 있다. 실패 응답은 캐시하지 않는다.
        if (!cancelled) setCatalog(EMPTY);
      });
    return () => {
      cancelled = true;
    };
  }, [guest]);
  return guest ? EMPTY : catalog;
}
