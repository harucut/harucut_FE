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
  type: "image" | "video";
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
}: FramePreviewProps) {
  const layout = FRAME_LAYOUTS[frameId];

  if (!layout) return null;
  const { totalWidth, totalHeight, slots, full } = layout;
  const previewFilter = getFourcutFilterCssValue(outputFilter);

  const outer = [
    "rounded-lg border bg-zinc-900/80 p-2 transition-all",
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
        };

        const mediaStyle: CSSProperties = {
          ...baseStyle,
          filter: previewFilter,
        };

        const mediaItem: FrameMedia | null =
          media?.[idx] ??
          (images && images[idx]
            ? { type: "image", src: images[idx] as string }
            : null);

        if (mediaItem) {
          if (mediaItem.type === "video") {
            return (
              <video
                key={idx}
                src={mediaItem.src}
                className="absolute rounded-md object-cover"
                style={mediaStyle}
                autoPlay
                loop
                muted
                playsInline
              />
            );
          }

          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={idx}
              src={mediaItem.src}
              alt={`frame-slot-${idx + 1}`}
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
