"use client";

import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { loadImage } from "@/lib/canvas/loaders";
import type { ThemeBackground, ThemeExportJson } from "@/lib/types/themeEditor";

function toPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("png blob create failed"));
      resolve(blob);
    }, "image/png");
  });
}

function normalizeHexColor(input?: string) {
  const cleaned = (input ?? "").trim().replace(/^#/, "");
  const hex = cleaned.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toLowerCase();
  if (hex.length === 3) {
    return hex
      .split("")
      .map((c) => `${c}${c}`)
      .join("");
  }
  return hex.padEnd(6, "0");
}

function getPreviewBackgroundColor(background?: ThemeBackground) {
  if (background?.type === "COLOR") {
    return normalizeHexColor(background.value);
  }

  return "111827";
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function renderThemePreviewPng(theme: ThemeExportJson) {
  const layout = FRAME_LAYOUTS[theme.frameId];
  const canvas = document.createElement("canvas");
  canvas.width = layout.totalWidth;
  canvas.height = layout.totalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context not available");

  const bg = getPreviewBackgroundColor(theme.background);
  ctx.fillStyle = `#${bg}`;
  drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 60);
  ctx.fill();

  // IMAGE 배경: 색 위, 슬롯 아래에 cover로 깐다.
  if (theme.background?.type === "IMAGE" && theme.background.url) {
    try {
      const bgImg = await loadImage(theme.background.url);
      const iw = bgImg.naturalWidth || bgImg.width || 1;
      const ih = bgImg.naturalHeight || bgImg.height || 1;
      const fr = canvas.width / canvas.height;
      const ir = iw / ih;
      let dw = canvas.width;
      let dh = canvas.height;
      let dx = 0;
      let dy = 0;
      if (ir > fr) {
        dh = canvas.height;
        dw = dh * ir;
        dx = (canvas.width - dw) / 2;
      } else {
        dw = canvas.width;
        dh = dw / ir;
        dy = (canvas.height - dh) / 2;
      }
      ctx.save();
      drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 60);
      ctx.clip();
      ctx.globalAlpha = Math.min(1, Math.max(0, theme.background.opacity ?? 1));
      ctx.drawImage(bgImg, dx, dy, dw, dh);
      ctx.restore();
    } catch {}
  }

  // CanvasStage와 동일한 슬롯 음영 레이어
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  layout.slots.forEach((slot) => {
    drawRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, 40);
    ctx.fill();
  });

  const sources = Array.from(
    new Set(theme.components.filter((c) => c.type !== "TEXT").map((c) => c.source)),
  );
  const imageMap = new Map<string, HTMLImageElement>();

  await Promise.all(
    sources.map(async (src) => {
      try {
        imageMap.set(src, await loadImage(src));
      } catch {}
    }),
  );

  const sorted = [...theme.components].sort((a, b) => a.zIndex - b.zIndex);
  sorted.forEach((c) => {
    const scale = c.scale ?? 1;
    const rotation = c.rotation ?? 0;
    const opacityRaw = c.styleJson?.opacity;
    const opacity =
      typeof opacityRaw === "number" ? Math.min(1, Math.max(0, opacityRaw)) : 1;

    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.translate(-c.width / 2, -c.height / 2);

    if (c.type === "TEXT") {
      const style = c.styleJson ?? {};
      const fontFamily =
        typeof style.fontFamily === "string" ? style.fontFamily : "Pretendard";
      const fontSize =
        typeof style.fontSize === "number" ? style.fontSize : 128;
      const fill = typeof style.color === "string" ? style.color : "#ffffff";
      const align =
        style.textAlign === "center" || style.textAlign === "right"
          ? style.textAlign
          : "left";
      const lineHeight = Math.max(1, Math.round(fontSize * 1.15));
      const lines = c.source.split("\n");

      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = fill;
      ctx.textBaseline = "top";
      ctx.textAlign = align;

      const textX =
        align === "center" ? c.width / 2 : align === "right" ? c.width : 0;
      lines.forEach((line, i) => {
        ctx.fillText(line, textX, i * lineHeight);
      });
      ctx.restore();
      return;
    }

    const img = imageMap.get(c.source);
    if (img) {
      ctx.drawImage(img, 0, 0, c.width, c.height);
    }
    ctx.restore();
  });

  // CanvasStage와 동일한 프레임/슬롯 라인 오버레이
  ctx.lineWidth = 6;
  layout.slots.forEach((slot) => {
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    drawRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, 40);
    ctx.stroke();
  });

  return toPngBlob(canvas);
}
