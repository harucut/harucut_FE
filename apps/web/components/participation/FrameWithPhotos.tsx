import type { CSSProperties } from "react";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { frameIdFromFrameType } from "@/lib/frameApi";
import type { EventFrameRef } from "@/lib/event/types";

const layoutOf = (layoutType: EventFrameRef["layoutType"]) => FRAME_LAYOUTS[frameIdFromFrameType(layoutType)];

/** 정해진 상자(`[container-type:size]`) 안에 프레임을 잘리지 않게 맞추는 크기. object-contain 과 같은 결과다. */
export function frameFitStyle(layoutType: EventFrameRef["layoutType"]): CSSProperties {
  const layout = layoutOf(layoutType);
  return { width: `min(100cqw, calc(100cqh * ${layout.totalWidth / layout.totalHeight}))` };
}

/** 세로로 긴 프레임인가. 크게 보여 주려면 옆에 다른 것을 나란히 둘 수 있다. */
export function frameIsTall(layoutType: EventFrameRef["layoutType"]) {
  const layout = layoutOf(layoutType);
  return layout.totalHeight > layout.totalWidth;
}

/**
 * 프레임 그림 아래에 사진을 깐다. 저장할 때 구운 프레임 그림은 칸이 뚫린 PNG 라(`renderThemePreviewPng`), 그대로 겹치면
 * 합성과 같은 순서가 된다 — 칸 위 글자·스티커가 사진 위에 남고, 칸 모양은 그림의 구멍이 정한다.
 * 칸을 회색으로 구운 옛 그림이면 사진이 가려져 회색 칸으로 보인다. 자유 칸을 쓰는 프레임은 사진이 기본 칸 자리에 깔린다.
 * 세로로 찍은 예시 사진을 가로로 긴 칸에 넣으면 위아래가 잘린다. 얼굴이 위쪽에 있으니 위를 남긴다. 칸 비율로 찍은 참가자 사진은 잘리지 않아 영향이 없다.
 */
export function FrameWithPhotos({
  frame,
  photos,
  className,
  style,
}: {
  frame: Pick<EventFrameRef, "layoutType" | "previewUrl">;
  photos: readonly (string | null)[];
  className?: string;
  style?: CSSProperties;
}) {
  const layout = layoutOf(frame.layoutType);
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  return (
    <div
      className={["relative overflow-hidden", className].filter(Boolean).join(" ")}
      style={{ aspectRatio: `${layout.totalWidth} / ${layout.totalHeight}`, ...style }}
    >
      {layout.slots.map((slot, index) => {
        const position = {
          left: pct(slot.x, layout.totalWidth),
          top: pct(slot.y, layout.totalHeight),
          width: pct(slot.width, layout.totalWidth),
          height: pct(slot.height, layout.totalHeight),
        };
        const photo = photos[index];
        return photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={index} src={photo} alt="" decoding="async" draggable={false} className="absolute object-cover object-[50%_25%]" style={position} />
        ) : (
          <span key={index} aria-hidden className="absolute bg-black/25" style={position} />
        );
      })}
      {frame.previewUrl ? (
        // 서명 URL 이라 next/image 로 보내지 않고 Referer 도 보내지 않는다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame.previewUrl} alt="" referrerPolicy="no-referrer" draggable={false} className="absolute inset-0 size-full" />
      ) : null}
    </div>
  );
}

/** 한 묶음의 사진을 몇 칸 밀어 낸다. 나란히 놓인 프레임이 같은 사진으로 보이지 않게 한다. */
export function rotatedPhotos(photos: readonly string[], by: number) {
  return photos.map((_, index) => photos[(index + by) % photos.length]);
}
