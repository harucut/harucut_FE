import { drawCover, type Rect } from "@/lib/canvas/draw";
import { loadImage, loadVideo } from "@/lib/canvas/loaders";
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

export type FrameSource =
  | { type: "image"; src: string }
  | { type: "video"; src: string };

type SlotDrawable =
  | { kind: "image"; el: HTMLImageElement }
  | { kind: "video"; el: HTMLVideoElement };

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
      if (source.type === "video") {
        const video = await loadVideo(source.src);
        video.currentTime = 0;
        return { kind: "video", el: video };
      }

      const image = await loadImage(source.src);
      return { kind: "image", el: image };
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

function drawFrameOnce(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  borderColor: string,
  drawables: SlotDrawable[],
  outputFilter: FourcutFilterId,
  theme: ThemeExportJson | null,
  overlayImages: OverlayImageMap,
) {
  const { totalWidth, totalHeight, slots } = layout;
  const slotFilter = getFourcutFilterCanvasValue(outputFilter);

  ctx.fillStyle = borderColor;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  slots.forEach((slot, index) => {
    const drawable = drawables[index];
    if (!drawable) return;

    ctx.save();
    ctx.filter = slotFilter;

    if (drawable.kind === "image") {
      const imageWidth = drawable.el.naturalWidth || drawable.el.width || 1;
      const imageHeight = drawable.el.naturalHeight || drawable.el.height || 1;
      drawCover(ctx, drawable.el, imageWidth, imageHeight, slot);
      ctx.restore();
      return;
    }

    const videoWidth = drawable.el.videoWidth || 1;
    const videoHeight = drawable.el.videoHeight || 1;
    drawCover(ctx, drawable.el, videoWidth, videoHeight, slot);
    ctx.restore();
  });

  drawThemeOverlay(ctx, theme, overlayImages);
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

  drawFrameOnce(
    ctx,
    layout,
    borderColor,
    drawables,
    outputFilter,
    theme,
    overlayImages,
  );

  return toPngBlob(canvas);
}

export async function recordFrameWebm(opts: {
  layout: FrameLayout;
  borderColor: string;
  sources: FrameSource[];
  outputFilter?: FourcutFilterId;
  theme?: ThemeExportJson | null;
  seconds: number;
  fps?: number;
  canvas?: HTMLCanvasElement;
}) {
  const {
    layout,
    borderColor,
    sources,
    outputFilter = "NONE",
    theme = null,
    seconds,
  } = opts;

  if (sources.length !== layout.slots.length) {
    throw new Error("sources length must match slot count");
  }

  const fps = opts.fps ?? 30;

  const canvas = opts.canvas ?? document.createElement("canvas");
  canvas.width = layout.totalWidth;
  canvas.height = layout.totalHeight;

  const ctx = ensureCtx(canvas);
  const drawables = await loadDrawables(sources);
  const overlayImages = await loadOverlayImages(theme);

  await Promise.all(
    drawables
      .filter(
        (drawable): drawable is { kind: "video"; el: HTMLVideoElement } =>
          drawable.kind === "video",
      )
      .map((drawable) => drawable.el.play().catch(() => undefined)),
  );

  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      try {
        resolve(new Blob(chunks, { type: "video/webm" }));
      } catch (error) {
        reject(error);
      }
    };
    recorder.onerror = () => reject(new Error("recorder error"));
  });

  recorder.start();

  const start = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;

      drawFrameOnce(
        ctx,
        layout,
        borderColor,
        drawables,
        outputFilter,
        theme,
        overlayImages,
      );

      if (elapsed >= seconds) {
        recorder.stop();

        drawables
          .filter(
            (drawable): drawable is { kind: "video"; el: HTMLVideoElement } =>
              drawable.kind === "video",
          )
          .forEach((drawable) => {
            try {
              drawable.el.pause();
            } catch {}
          });

        resolve();
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });

  return stopped;
}
