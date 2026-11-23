import { Fragment, type CSSProperties } from "react";
import { ThemeOverlaySvg } from "@/components/theme/editor/ThemeOverlaySvg";
import type { FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { SLOT_COLORS } from "@/constants/colors";
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
  /**
   * 칸마다 색과 번호를 그린다(사진 고르기). 빈 칸은 그 색으로 옅게 칠하고, 찬 칸은 그 색 테두리를
   * 두른다. 고른 사진의 번호 배지와 같은 색이라 어느 사진이 어느 칸에 들어가는지 이어진다(SLOT_COLORS).
   */
  markSlots?: boolean;
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
  markSlots = false,
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
        // 칸 번호는 몇 번째로 고른 사진이 들어가는지다(자유 칸이면 놓인 자리와 다를 수 있다).
        const mark = markSlots ? { color: SLOT_COLORS[shot % SLOT_COLORS.length], number: shot + 1 } : null;

        if (mediaItem) {
          return (
            <Fragment key={idx}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
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
                // 예시 사진은 세로로 찍혔다. 가로로 긴 칸에 넣으면 위아래가 잘리니 얼굴이 있는 위를 남긴다.
                // 사용자 사진은 서버 합성과 같게 가운데를 쓴다.
                style={mediaItem.src.startsWith("/demo/") ? { ...mediaStyle, objectPosition: "50% 25%" } : mediaStyle}
              />
              {mark ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute z-10 rounded-md"
                  style={{ ...baseStyle, boxShadow: `inset 0 0 0 2px ${mark.color}` }}
                >
                  <span
                    className="absolute left-1 top-1 grid size-4.5 place-items-center rounded-full font-mono text-[11px] font-extrabold text-[#14140F]"
                    style={{ backgroundColor: mark.color }}
                  >
                    {mark.number}
                  </span>
                </span>
              ) : null}
            </Fragment>
          );
        }

        if (mark) {
          return (
            <div
              key={idx}
              aria-hidden
              className="absolute grid place-items-center rounded-md border-2 border-dashed font-mono text-[15px] font-extrabold"
              // 옅은 칠은 색 뒤에 알파(40 ≈ 25%)를 붙여 만든다. 어두운 프레임·밝은 프레임 모두에서 칸이 보인다.
              style={{ ...baseStyle, backgroundColor: `${mark.color}40`, borderColor: mark.color, color: mark.color }}
            >
              {mark.number}
            </div>
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
