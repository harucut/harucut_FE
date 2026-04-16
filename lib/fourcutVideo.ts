"use client";

import type { FrameSource } from "@/lib/canvas/composeFrame";
import { loadVideo } from "@/lib/canvas/loaders";

export const MAX_FOURCUT_VIDEO_SECONDS = 8;
export const TRIMMED_VIDEO_NOTICE =
  "8초를 넘는 입력 영상은 앞 8초만 사용해 8초 결과로 만들어요.";

export async function hasVideoSourceLongerThan(
  sources: FrameSource[],
  maxSeconds = MAX_FOURCUT_VIDEO_SECONDS,
) {
  const videoSources = sources.filter(
    (source): source is Extract<FrameSource, { type: "video" }> =>
      source.type === "video",
  );

  if (videoSources.length === 0) {
    return false;
  }

  const durations = await Promise.all(
    videoSources.map(async (source) => {
      try {
        const video = await loadVideo(source.src, { loop: false });
        const duration = Number.isFinite(video.duration) ? video.duration : 0;

        try {
          video.pause();
        } catch {}

        return duration;
      } catch {
        return 0;
      }
    }),
  );

  return durations.some((duration) => duration > maxSeconds + 0.05);
}
