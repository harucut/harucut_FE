"use client";

import { useCallback, useEffect, useState } from "react";
import type { RemoteFrame } from "@/lib/api-types";
import { listMyFrames } from "@/lib/remoteFrameApi";

export function useMyFrames() {
  const [frames, setFrames] = useState<RemoteFrame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextFrames = await listMyFrames();
      setFrames(nextFrames);
    } catch (loadError) {
      console.error(loadError);
      setError("저장한 프레임을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    frames,
    isLoading,
    error,
    refresh,
  };
}
