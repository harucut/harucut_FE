"use client";

import { useEffect, useState } from "react";
import { FrameWithPhotos, frameFitStyle } from "@/components/participation/FrameWithPhotos";
import type { EventFrameRef } from "@/lib/event/types";

/** 사진을 만드는 동안의 자리. 정해진 상자(`[container-type:size]`) 안에서 잘리지 않게 맞춘다. */
export function DevelopingPlaceholder() {
  return (
    <div
      aria-hidden
      className="ev-developing grid aspect-2/3 grid-cols-2 gap-2 rounded-2xl border border-(--ev-border) bg-(--ev-card) p-3"
      style={{ width: "min(100cqw, calc(100cqh * 2 / 3))" }}
    >
      {[0, 1, 2, 3].map((slot) => (
        <span key={slot} className="rounded-lg bg-[color-mix(in_srgb,var(--ev-text)_9%,transparent)]" />
      ))}
    </div>
  );
}

/**
 * 합성을 기다리는 동안 방금 찍은 네 장을 프레임에 넣어 보여 준다. 사진이 이미 내 손에 있는데 빈 카드를 보여 주면
 * 사진을 잃은 줄 안다. 서버가 만든 사진이 도착하면 이 자리를 넘겨준다. 미리보기 주소는 이 화면이 끝나면 해제한다.
 */
export function DevelopingPhoto({ frame, photos }: { frame?: EventFrameRef; photos?: Blob[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!photos) return;
    const next = photos.map((photo) => URL.createObjectURL(photo));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 만든 주소를 이 이펙트가 해제까지 책임진다
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);
  if (!frame?.previewUrl || urls.length === 0) return <DevelopingPlaceholder />;
  return (
    <FrameWithPhotos
      frame={frame}
      photos={urls}
      className="ev-developing rounded-xl shadow-[0_14px_34px_rgba(0,0,0,0.18)]"
      style={frameFitStyle(frame.layoutType)}
    />
  );
}
