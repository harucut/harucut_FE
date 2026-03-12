import { drawCover, type Rect } from "@/lib/canvas/draw";
import { loadImage, loadVideo } from "@/lib/canvas/loaders";
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

// 2D 컨텍스트 확보 (없으면 에러)
function ensureCtx(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context not available");
  return ctx;
}

// 캔버스를 PNG Blob으로 변환
function toPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("png blob create failed"));
      resolve(blob);
    }, "image/png");
  });
}

/** Blob 다운로드 유틸 */
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

// 슬롯 소스를 실제 이미지/비디오 요소로 로드
async function loadDrawables(sources: FrameSource[]): Promise<SlotDrawable[]> {
  return Promise.all(
    sources.map(async (s) => {
      if (s.type === "video") {
        const v = await loadVideo(s.src);
        v.currentTime = 0;
        return { kind: "video", el: v };
      }
      const img = await loadImage(s.src);
      return { kind: "image", el: img };
    }),
  );
}

async function loadOverlayImages(theme: ThemeExportJson | null) {
  const map: OverlayImageMap = new Map();
  if (!theme) return map;

  const sources = Array.from(
    new Set(
      theme.components.filter((c) => c.type !== "TEXT").map((c) => c.source),
    ),
  );

  await Promise.all(
    sources.map(async (src) => {
      try {
        const img = await loadImage(src);
        map.set(src, img);
      } catch {
        // 이미지 1개 로딩 실패는 전체 합성을 깨지 않도록 무시
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

  theme.components.forEach((c) => {
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

    const img = overlayImages.get(c.source);
    if (img) {
      ctx.drawImage(img, 0, 0, c.width, c.height);
    }

    ctx.restore();
  });
}

// 프레임 배경 + 슬롯 이미지/비디오 1회 그리기
function drawFrameOnce(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  borderColor: string,
  drawables: SlotDrawable[],
  theme: ThemeExportJson | null,
  overlayImages: OverlayImageMap,
) {
  const { totalWidth, totalHeight, slots } = layout;

  ctx.fillStyle = borderColor;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  slots.forEach((slot, index) => {
    const d = drawables[index];
    if (!d) return;

    if (d.kind === "image") {
      const iw = d.el.naturalWidth || d.el.width || 1;
      const ih = d.el.naturalHeight || d.el.height || 1;
      drawCover(ctx, d.el, iw, ih, slot);
      return;
    }

    const vw = d.el.videoWidth || 1;
    const vh = d.el.videoHeight || 1;
    drawCover(ctx, d.el, vw, vh, slot);
  });

  drawThemeOverlay(ctx, theme, overlayImages);
}

// 선택된 슬롯을 합성해 PNG Blob 생성
export async function composeFramePng(opts: {
  layout: FrameLayout;
  borderColor: string;
  sources: FrameSource[]; // 반드시 슬롯 개수만큼
  theme?: ThemeExportJson | null;
  canvas?: HTMLCanvasElement;
}) {
  const { layout, borderColor, sources, theme = null } = opts;

  if (sources.length !== layout.slots.length) {
    throw new Error("sources length must match slot count");
  }

  const canvas = opts.canvas ?? document.createElement("canvas");
  canvas.width = layout.totalWidth;
  canvas.height = layout.totalHeight;

  const ctx = ensureCtx(canvas);
  const drawables = await loadDrawables(sources);
  const overlayImages = await loadOverlayImages(theme);

  drawFrameOnce(ctx, layout, borderColor, drawables, theme, overlayImages);

  return toPngBlob(canvas);
}

// 선택된 슬롯을 합성해 WEBM 영상 Blob 생성
export async function recordFrameWebm(opts: {
  layout: FrameLayout;
  borderColor: string;
  sources: FrameSource[]; // image/video 섞여도 됨
  theme?: ThemeExportJson | null;
  seconds: number;
  fps?: number;
  canvas?: HTMLCanvasElement;
}) {
  const { layout, borderColor, sources, theme = null, seconds } = opts;

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

  // video 재생
  await Promise.all(
    drawables
      .filter(
        (d): d is { kind: "video"; el: HTMLVideoElement } => d.kind === "video",
      )
      .map((d) => d.el.play().catch(() => undefined)),
  );

  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      try {
        resolve(new Blob(chunks, { type: "video/webm" }));
      } catch (e) {
        reject(e);
      }
    };
    recorder.onerror = () => reject(new Error("recorder error"));
  });

  recorder.start();

  const start = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;

      drawFrameOnce(ctx, layout, borderColor, drawables, theme, overlayImages);

      if (elapsed >= seconds) {
        recorder.stop();

        drawables
          .filter(
            (d): d is { kind: "video"; el: HTMLVideoElement } =>
              d.kind === "video",
          )
          .forEach((d) => {
            try {
              d.el.pause();
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
