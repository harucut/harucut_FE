import { drawCover, type Rect } from "@/lib/canvas/draw";
import { loadImage } from "@/lib/canvas/loaders";
import {
  getFourcutFilterCanvasValue,
  type FourcutFilterId,
} from "@/lib/frameFilters";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

export type FrameLayout = {
  totalWidth: number;
  totalHeight: number;
  slots: Rect[];
};

export type FrameSource = { type: "image"; src: string };

type SlotDrawable = { kind: "image"; el: HTMLImageElement };

type OverlayImageMap = Map<string, HTMLImageElement>;

function ensureCtx(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context not available");
  return ctx;
}

function toPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("png blob create failed"));
      resolve(blob);
    }, "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerDownloadLink(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (filename) {
    a.download = filename;
  }
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function filenameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split("/").pop() || "download");
  } catch {
    return "download";
  }
}

export async function downloadFromUrl(url: string, filename?: string) {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(`download failed: ${res.status}`);
    }

    const blob = await res.blob();
    downloadBlob(blob, filename ?? filenameFromUrl(url));
  } catch {
    triggerDownloadLink(url, filename);
  }
}

async function loadDrawables(sources: FrameSource[]): Promise<SlotDrawable[]> {
  return Promise.all(
    sources.map(async (source) => {
      const image = await loadImage(source.src);
      return { kind: "image", el: image } as const;
    }),
  );
}

async function loadOverlayImages(theme: ThemeExportJson | null) {
  const map: OverlayImageMap = new Map();
  if (!theme) return map;

  const sources = Array.from(
    new Set(
      theme.components.filter((component) => component.type !== "TEXT").map((component) => component.source),
    ),
  );

  await Promise.all(
    sources.map(async (src) => {
      try {
        const image = await loadImage(src);
        map.set(src, image);
      } catch {
        // Ignore individual overlay image load failures and render the rest.
      }
    }),
  );

  return map;
}

// IMAGE 배경(슬롯 뒤에 깔리는 배경)을 로드한다. 실패 시 null → 색 배경만 사용.
async function loadBackgroundImage(theme: ThemeExportJson | null) {
  if (!theme || theme.background?.type !== "IMAGE") return null;
  const url = theme.background.url;
  if (!url) return null;

  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

function drawThemeOverlay(
  ctx: CanvasRenderingContext2D,
  theme: ThemeExportJson | null,
  overlayImages: OverlayImageMap,
) {
  if (!theme) return;

  theme.components.forEach((component) => {
    const scale = component.scale ?? 1;
    const rotation = component.rotation ?? 0;
    const opacityRaw = component.styleJson?.opacity;
    const opacity =
      typeof opacityRaw === "number" ? Math.min(1, Math.max(0, opacityRaw)) : 1;

    const centerX = component.x + component.width / 2;
    const centerY = component.y + component.height / 2;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.translate(-component.width / 2, -component.height / 2);

    if (component.type === "TEXT") {
      const style = component.styleJson ?? {};
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
      const lines = component.source.split("\n");

      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = fill;
      ctx.textBaseline = "top";
      ctx.textAlign = align;

      const textX =
        align === "center"
          ? component.width / 2
          : align === "right"
            ? component.width
            : 0;

      lines.forEach((line, index) => {
        ctx.fillText(line, textX, index * lineHeight);
      });

      ctx.restore();
      return;
    }

    const image = overlayImages.get(component.source);
    if (image) {
      ctx.drawImage(image, 0, 0, component.width, component.height);
    }

    ctx.restore();
  });
}

function traceRoundedRect(
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

// 누끼(셀별 배경 제거) 비네트 — renderThemePreview와 동일하게 사용자 컴포넌트 위에
// 그려, 에디터/썸네일뿐 아니라 실제 다운로드·공유 출력에서도 효과가 유지되게 한다.
function drawCellCutouts(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  theme: ThemeExportJson | null,
) {
  const cutouts = theme?.cellCutouts ?? [];
  layout.slots.forEach((slot, index) => {
    if (!cutouts[index]) return;
    const cx = slot.x + slot.width / 2;
    const cy = slot.y + slot.height / 2;
    const radius = Math.min(slot.width, slot.height) * 0.62;
    ctx.save();
    traceRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, 40);
    ctx.clip();
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(11,11,12,0.82)");
    ctx.fillStyle = grad;
    traceRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, 40);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#1ED760";
    traceRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, 40);
    ctx.stroke();
    ctx.restore();
  });
}

function drawFrameOnce(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  borderColor: string,
  drawables: SlotDrawable[],
  outputFilter: FourcutFilterId,
  theme: ThemeExportJson | null,
  overlayImages: OverlayImageMap,
  backgroundImage: HTMLImageElement | null,
) {
  const { totalWidth, totalHeight, slots } = layout;
  const slotFilter = getFourcutFilterCanvasValue(outputFilter);

  ctx.fillStyle = borderColor;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 배경 이미지를 색 배경 위, 슬롯(사진) 아래에 cover로 깐다.
  if (backgroundImage) {
    const bgOpacity =
      theme?.background?.type === "IMAGE" ? theme.background.opacity ?? 1 : 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, bgOpacity));
    drawCover(
      ctx,
      backgroundImage,
      backgroundImage.naturalWidth || backgroundImage.width || 1,
      backgroundImage.naturalHeight || backgroundImage.height || 1,
      { x: 0, y: 0, width: totalWidth, height: totalHeight },
    );
    ctx.restore();
  }

  slots.forEach((slot, index) => {
    const drawable = drawables[index];
    if (!drawable) return;

    ctx.save();
    ctx.filter = slotFilter;

    const imageWidth = drawable.el.naturalWidth || drawable.el.width || 1;
    const imageHeight = drawable.el.naturalHeight || drawable.el.height || 1;
    drawCover(ctx, drawable.el, imageWidth, imageHeight, slot);
    ctx.restore();
  });

  drawThemeOverlay(ctx, theme, overlayImages);
  drawCellCutouts(ctx, layout, theme);
}

export async function composeFramePng(opts: {
  layout: FrameLayout;
  borderColor: string;
  sources: FrameSource[];
  outputFilter?: FourcutFilterId;
  theme?: ThemeExportJson | null;
  canvas?: HTMLCanvasElement;
}) {
  const {
    layout,
    borderColor,
    sources,
    outputFilter = "NONE",
    theme = null,
  } = opts;

  if (sources.length !== layout.slots.length) {
    throw new Error("sources length must match slot count");
  }

  const canvas = opts.canvas ?? document.createElement("canvas");
  canvas.width = layout.totalWidth;
  canvas.height = layout.totalHeight;

  const ctx = ensureCtx(canvas);
  const drawables = await loadDrawables(sources);
  const overlayImages = await loadOverlayImages(theme);
  const backgroundImage = await loadBackgroundImage(theme);

  drawFrameOnce(
    ctx,
    layout,
    borderColor,
    drawables,
    outputFilter,
    theme,
    overlayImages,
    backgroundImage,
  );

  return toPngBlob(canvas);
}
