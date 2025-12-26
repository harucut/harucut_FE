import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import type { FrameId } from "@/constants/frames";

export type FrameMedia = {
  type: "image" | "video";
  src: string;
};

type FramePreviewProps = {
  frameId: FrameId;
  // selected?: boolean;
  className?: string;
  media?: (FrameMedia | null)[];
  images?: (string | null)[];
  borderColor?: string;
};

export function FramePreview({
  frameId,
  // selected,
  className = "",
  media,
  images,
  borderColor,
}: FramePreviewProps) {
  const layout = FRAME_LAYOUTS[frameId];

  if (!layout) return null;
  const { totalWidth, totalHeight, slots, full } = layout;

  const outer = [
    "rounded-lg border bg-zinc-900/80 p-2 transition-all",
    // selected
    //   ? "border-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.6)]"
    //   : "border-zinc-700",
    full,
    className,
  ].join(" ");

  const slotBase = "bg-zinc-800/90 rounded-md";

  return (
    <div
      className={["relative", outer].join(" ")}
      style={{
        aspectRatio: `${totalWidth} / ${totalHeight}`,
        backgroundColor: borderColor,
      }}
    >
      {slots.map((slot, idx) => {
        const leftPct = (slot.x / totalWidth) * 100;
        const topPct = (slot.y / totalHeight) * 100;
        const widthPct = (slot.width / totalWidth) * 100;
        const heightPct = (slot.height / totalHeight) * 100;

        const baseStyle: React.CSSProperties = {
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
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
                style={baseStyle}
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
              style={baseStyle}
            />
          );
        }

        // 아직 선택 안 된 슬롯은 회색 박스로
        return (
          <div key={idx} className={slotBase + " absolute"} style={baseStyle} />
        );
      })}
    </div>
  );
}
