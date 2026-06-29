"use client";

import { loadImage } from "@/lib/canvas/loaders";
import type { DecorComponent, DrawStroke } from "@/lib/decorateStore";
import type { TextStyleJson } from "@/lib/types/themeEditor";

function readOpacity(styleJson: unknown): number {
  const raw = (styleJson as { opacity?: unknown } | undefined)?.opacity;
  return typeof raw === "number" ? Math.min(1, Math.max(0, raw)) : 1;
}

// 베이스 네컷 이미지 위에 자유 드로잉(아래) → 스티커/텍스트(위) 순으로 그려 PNG Blob을 만든다.
// 좌표/크기는 모두 베이스 이미지 픽셀 좌표계라 원본 해상도 그대로 합성된다.
export async function composeDecoratedPng(opts: {
  base: { src: string; width: number; height: number };
  components: DecorComponent[];
  strokes: DrawStroke[];
}): Promise<Blob> {
  const { base, components, strokes } = opts;

  const canvas = document.createElement("canvas");
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context not available");

  // 1) 베이스 네컷
  const baseImg = await loadImage(base.src);
  ctx.drawImage(baseImg, 0, 0, base.width, base.height);

  // 2) 자유 드로잉(스티커/텍스트 아래)
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length < 4) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0], stroke.points[1]);
    for (let i = 2; i < stroke.points.length; i += 2) {
      ctx.lineTo(stroke.points[i], stroke.points[i + 1]);
    }
    ctx.stroke();
  }

  // 3) 스티커/텍스트 (zIndex 순)
  const sorted = [...components]
    .filter((c) => !c.hidden)
    .sort((a, b) => a.zIndex - b.zIndex);

  const imageMap = new Map<string, HTMLImageElement>();
  await Promise.all(
    Array.from(
      new Set(sorted.filter((c) => c.type === "STICKER").map((c) => c.source)),
    ).map(async (src) => {
      try {
        imageMap.set(src, await loadImage(src));
      } catch {
        // 개별 스티커 로드 실패는 무시하고 나머지를 그린다.
      }
    }),
  );

  for (const c of sorted) {
    const opacity = readOpacity(c.styleJson);
    const centerX = c.x + c.width / 2;
    const centerY = c.y + c.height / 2;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(centerX, centerY);
    ctx.rotate(((c.rotation ?? 0) * Math.PI) / 180);
    ctx.translate(-c.width / 2, -c.height / 2);

    if (c.type === "TEXT") {
      const style = (c.styleJson ?? {}) as TextStyleJson;
      const fontFamily = style.fontFamily || "Pretendard";
      const fontSize = style.fontSize || 64;
      const align =
        style.textAlign === "center" || style.textAlign === "right"
          ? style.textAlign
          : "left";
      const lineHeight = Math.max(1, Math.round(fontSize * 1.15));
      const lines = c.source.split("\n");

      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = style.color || "#ffffff";
      ctx.textBaseline = "top";
      ctx.textAlign = align;

      const textX =
        align === "center" ? c.width / 2 : align === "right" ? c.width : 0;
      lines.forEach((line, index) => ctx.fillText(line, textX, index * lineHeight));
    } else {
      const image = imageMap.get(c.source);
      if (image) ctx.drawImage(image, 0, 0, c.width, c.height);
    }

    ctx.restore();
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("png blob create failed")),
      "image/png",
    );
  });
}
