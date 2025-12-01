import type { FrameId } from "@/constants/frames";

type FramePreviewProps = {
  variant: FrameId;
  // selected?: boolean;
  className?: string;
  images?: string[];
  borderColor?: string;
};

type SlotRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FrameLayout = {
  totalWidth: number;
  totalHeight: number;
  slots: SlotRect[];
  full: "h-full" | "w-full";
};

export const FRAME_LAYOUTS: Record<FrameId, FrameLayout> = {
  // 1번: 2000 x 6000, 내부 1700 x 1200, gap 80
  // margin (top, right, bottom, left) = 200, 150, 760, 150
  "classic-4": (() => {
    const totalWidth = 2000;
    const totalHeight = 6000;
    const imgW = 1700;
    const imgH = 1200;
    const gap = 80;
    const top = 200;
    const left = 150;
    const full: FrameLayout["full"] = "h-full";

    const slots: SlotRect[] = Array.from({ length: 4 }, (_, i) => ({
      x: left,
      y: top + i * (imgH + gap),
      width: imgW,
      height: imgH,
    }));

    return { totalWidth, totalHeight, slots, full };
  })(),

  // 2번: 6000 x 4000, 내부 2400 x 1700, gap 200
  // margin (top, right, bottom, left) = 200, 800, 200, 200
  "wide-4": (() => {
    const totalWidth = 6000;
    const totalHeight = 4000;
    const imgW = 2400;
    const imgH = 1700;
    const gap = 200;
    const full: FrameLayout["full"] = "w-full";

    const slots: SlotRect[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        slots.push({
          x: gap + col * (imgW + gap),
          y: gap + row * (imgH + gap),
          width: imgW,
          height: imgH,
        });
      }
    }

    return { totalWidth, totalHeight, slots, full };
  })(),

  // 3번: 4000 x 6000, 내부 1700 x 2400, gap 200
  // margin (top, right, bottom, left) = 200, 200, 800, 200
  "grid-4": (() => {
    const totalWidth = 4000;
    const totalHeight = 6000;
    const imgW = 1700;
    const imgH = 2400;
    const gap = 200;
    const top = 200;
    const left = 200;
    const full: FrameLayout["full"] = "h-full";

    const slots: SlotRect[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        slots.push({
          x: left + col * (imgW + gap),
          y: top + row * (imgH + gap),
          width: imgW,
          height: imgH,
        });
      }
    }

    return { totalWidth, totalHeight, slots, full };
  })(),

  // 4번: 4000 x 6000, 내부 1700 x 2400, gap 200
  // 좌우 200, 위 빈공간 800, 아래 200으로 가정
  "polaroid-4": (() => {
    const totalWidth = 4000;
    const totalHeight = 6000;

    const imgW = 1700;
    const imgH = 2400;
    const gap = 200;
    const topBase = 800;

    const leftBottomY = imgH + gap * 2;
    const rightX = imgW + gap * 2;
    const rightBottomY = topBase + imgH + gap;
    const full: FrameLayout["full"] = "h-full";

    const slots: SlotRect[] = [
      { x: gap, y: gap, width: imgW, height: imgH },
      { x: rightX, y: topBase, width: imgW, height: imgH },
      { x: gap, y: leftBottomY, width: imgW, height: imgH },
      { x: rightX, y: rightBottomY, width: imgW, height: imgH },
    ];

    return { totalWidth, totalHeight, slots, full };
  })(),
};

export function FramePreview({
  variant,
  // selected,
  className = "",
  images,
  borderColor,
}: FramePreviewProps) {
  const layout = FRAME_LAYOUTS[variant];

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
        const imageSrc = images?.[idx];

        const baseStyle: React.CSSProperties = {
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
        };

        if (imageSrc) {
          // 슬롯 안에 선택된 이미지가 있을 때
          return (
            <img
              key={idx}
              src={imageSrc}
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
