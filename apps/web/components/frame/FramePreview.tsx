import type { CSSProperties } from "react";
import { ThemeOverlaySvg } from "@/components/theme/editor/ThemeOverlaySvg";
import type { FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import {
  getFourcutFilterCssValue,
  type FourcutFilterId,
} from "@/lib/frameFilters";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

export type FrameMedia = {
  src: string;
};

type FramePreviewProps = {
  frameId: FrameId;
  className?: string;
  media?: (FrameMedia | null)[];
  images?: (string | null)[];
  borderColor?: string;
  slotColor?: string;
  theme?: ThemeExportJson | null;
  outputFilter?: FourcutFilterId;
  /** 첫 화면(히어로)에 보이는 미리보기는 eager. 나머지는 lazy. */
  imageLoading?: "lazy" | "eager";
};

export function FramePreview({
  frameId,
  className = "",
  media,
  images,
  borderColor,
  slotColor,
  theme,
  outputFilter = "NONE",
  imageLoading = "lazy",
}: FramePreviewProps) {
  const layout = FRAME_LAYOUTS[frameId];

  if (!layout) return null;
  const { totalWidth, totalHeight, full } = layout;
  // 자유 사진 칸(P5)이면 그 칸을, 아니면 고정 레이아웃 칸을 그린다. 칸마다 넣을 사진은 shotIndex 번째다.
  const freeCells = theme && theme.frameId === frameId && theme.cells?.length === 4 ? theme.cells : null;
  const slots = freeCells ?? layout.slots.map((slot, shotIndex) => ({ ...slot, rotation: 0, shotIndex, shape: null }));
  const previewFilter = getFourcutFilterCssValue(outputFilter);

  const outer = [
    "rounded-lg border bg-zinc-900/80 p-2",
    // 회전한 자유 칸이 캔버스 밖으로 나오지 않게 경계에서 자른다 — 저장 미리보기 PNG(renderThemePreviewPng)와 같다.
    // 칸은 이 상자의 안쪽(padding box) 기준으로 놓이므로 잘리는 선이 곧 캔버스 경계다.
    freeCells ? "overflow-hidden" : "",
    full,
    className,
  ].join(" ");

  const resolvedSlotColor = slotColor ?? "rgba(39,39,42,0.9)";

  return (
    <div
      className={["relative", outer].join(" ")}
      style={{
        aspectRatio: `${totalWidth} / ${totalHeight}`,
        backgroundColor: borderColor || undefined,
      }}
    >
      {theme?.background?.type === "IMAGE" && theme.background.url ? (
        // 배경 이미지는 슬롯(사진)보다 아래 레이어로 깔린다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={theme.background.url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ opacity: theme.background.opacity ?? 1 }}
        />
      ) : null}
      {slots.map((slot, idx) => {
        const leftPct = (slot.x / totalWidth) * 100;
        const topPct = (slot.y / totalHeight) * 100;
        const widthPct = (slot.width / totalWidth) * 100;
        const heightPct = (slot.height / totalHeight) * 100;

        const baseStyle: CSSProperties = {
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          // 자유 칸: 칸 중심 회전(시계 방향 도)과 모양. 고정 레이아웃 칸은 rounded-md 그대로다.
          ...(slot.shape
            ? {
                transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
                borderRadius:
                  slot.shape.type === "ELLIPSE"
                    ? "50%"
                    : slot.shape.type === "RECT"
                      ? `${(slot.shape.cornerRadius / slot.width) * 100}% / ${(slot.shape.cornerRadius / slot.height) * 100}%`
                      : 0,
              }
            : {}),
        };

        const mediaStyle: CSSProperties = {
          ...baseStyle,
          filter: previewFilter,
        };

        const shot = slot.shotIndex;
        const mediaItem: FrameMedia | null =
          media?.[shot] ??
          (images && images[shot] ? { src: images[shot] as string } : null);

        if (mediaItem) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={idx}
              loading={imageLoading}
              decoding="async"
              // 치수는 슬롯 비율의 힌트다(CLS 방지). 실제 크기는 CSS 가 정한다.
              width={slot.width}
              height={slot.height}
              src={mediaItem.src}
              // 이 미리보기는 프레임 "구성"을 보여주는 그림이다. 슬롯 하나하나를
              // "frame-slot-1" 이라고 읽어 주면 스크린리더에는 개발자 문자열만 남는다.
              alt=""
              aria-hidden
              className="absolute rounded-md object-cover"
              style={mediaStyle}
            />
          );
        }

        return (
          <div
            key={idx}
            className="absolute rounded-md"
            style={{ ...baseStyle, backgroundColor: resolvedSlotColor }}
          />
        );
      })}

      {theme && theme.frameId === frameId ? (
        <ThemeOverlaySvg
          layout={layout}
          data={theme}
          className="pointer-events-none absolute inset-0 z-20"
        />
      ) : null}
    </div>
  );
}
