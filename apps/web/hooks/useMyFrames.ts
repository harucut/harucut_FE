"use client";

import { useCallback, useEffect, useState } from "react";
import type { RemoteFrame } from "@/lib/api-types";
import { listMyFrames } from "@/lib/remoteFrameApi";

export function useMyFrames() {
  const [frames, setFrames] = useState<RemoteFrame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const nextFrames = await listMyFrames();
      setFrames(nextFrames);
      setError(null);
    } catch (loadError) {
      console.error(loadError);
      setError("저장한 프레임을 불러오지 못했어요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    await load();
  }, [load]);

  // 최초 진입은 초기 상태(isLoading=true, error=null)와 같아 별도 setState 없이 바로 조회한다.
  // setState는 응답이 온 뒤에만 일어나므로 렌더가 연쇄되지 않는다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  return {
    frames,
    isLoading,
    error,
    refresh,
  };
}
