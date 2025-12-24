import type { FrameId } from "@/constants/frames";

export type SlotRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FrameLayout = {
  totalWidth: number;
  totalHeight: number;
  slots: SlotRect[];
  full: "h-full" | "w-full";
};

export const FRAME_LAYOUTS: Record<FrameId, FrameLayout> = {
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
