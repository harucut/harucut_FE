import { drawCover, type Rect } from "@/lib/canvas/draw";
import { loadImage, loadVideo } from "@/lib/canvas/loaders";
import {
  getFourcutFilterCanvasValue,
  type FourcutFilterId,
} from "@/lib/frameFilters";
import type { ThemeExportJson } from "@/lib/types/themeEditor";
import type { MuxerOptions } from "webm-muxer";

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
type SupportedVideoEncoderConfig = {
  encoderConfig: VideoEncoderConfig;
  muxerVideoOptions: NonNullable<MuxerOptions<ArrayBufferTarget>["video"]>;
};

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

async function waitForVideoData(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onLoadedData = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(video.error?.message ?? "video load error"));
    };
    const cleanup = () => {
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("error", onError);
  });
}

function resolveVideoFrameTime(elapsedSeconds: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  if (elapsedSeconds < duration) {
    return elapsedSeconds;
  }

  return elapsedSeconds % duration;
}

async function seekVideoToTime(video: HTMLVideoElement, nextTime: number) {
  await waitForVideoData(video);

  if (Math.abs(video.currentTime - nextTime) < 0.001) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(video.error?.message ?? "video seek error"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = nextTime;
  });
}

async function loadDrawables(sources: FrameSource[]): Promise<SlotDrawable[]> {
  return Promise.all(
    sources.map(async (source) => {
      if (source.type === "video") {
        const video = await loadVideo(source.src);
        const initialFrameTime =
          Number.isFinite(video.duration) && video.duration > 0.1 ? 0.1 : 0;
        await seekVideoToTime(video, initialFrameTime);
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

async function resolveVideoEncoderConfig(
  width: number,
  height: number,
  fps: number,
): Promise<SupportedVideoEncoderConfig> {
  const bitrate = Math.max(
    8_000_000,
    Math.round(width * height * fps * 0.12),
  );

  const candidates: SupportedVideoEncoderConfig[] = [
    {
      encoderConfig: {
        codec: "vp09.00.10.08",
        width,
        height,
        bitrate,
        framerate: fps,
        latencyMode: "quality",
      },
      muxerVideoOptions: {
        codec: "V_VP9",
        width,
        height,
        frameRate: fps,
      },
    },
    {
      encoderConfig: {
        codec: "vp8",
        width,
        height,
        bitrate,
        framerate: fps,
        latencyMode: "quality",
      },
      muxerVideoOptions: {
        codec: "V_VP8",
        width,
        height,
        frameRate: fps,
      },
    },
  ];

  for (const candidate of candidates) {
    const support = await VideoEncoder.isConfigSupported(
      candidate.encoderConfig,
    ).catch(() => null);

    if (support?.supported) {
      return {
        encoderConfig: support.config,
        muxerVideoOptions: candidate.muxerVideoOptions,
      };
    }
  }

  throw new Error("No supported WebCodecs video encoder configuration found");
}

async function syncVideoDrawablesToElapsedTime(
  drawables: Array<{ kind: "video"; el: HTMLVideoElement }>,
  elapsedSeconds: number,
) {
  await Promise.all(
    drawables.map((drawable) =>
      seekVideoToTime(
        drawable.el,
        resolveVideoFrameTime(elapsedSeconds, drawable.el.duration),
      ),
    ),
  );
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
  const videoDrawables = drawables.filter(
    (drawable): drawable is { kind: "video"; el: HTMLVideoElement } =>
      drawable.kind === "video",
  );

  const frameDurationMicroseconds = Math.round(1_000_000 / fps);
  const totalFrames = Math.max(1, Math.round(seconds * fps) + 1);
  const encoderSupport = await resolveVideoEncoderConfig(
    layout.totalWidth,
    layout.totalHeight,
    fps,
  );
  const { ArrayBufferTarget, Muxer } = await import("webm-muxer");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: encoderSupport.muxerVideoOptions,
    firstTimestampBehavior: "offset",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (error) => {
      throw error;
    },
  });

  encoder.configure(encoderSupport.encoderConfig);

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    const elapsed = frameIndex / fps;
    await syncVideoDrawablesToElapsedTime(videoDrawables, elapsed);

    drawFrameOnce(
      ctx,
      layout,
      borderColor,
      drawables,
      outputFilter,
      theme,
      overlayImages,
    );

    const frame = new VideoFrame(canvas, {
      timestamp: frameIndex * frameDurationMicroseconds,
      duration: frameDurationMicroseconds,
    });
    encoder.encode(frame, {
      keyFrame: frameIndex === 0 || frameIndex % fps === 0,
    });
    frame.close();
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  videoDrawables.forEach((drawable) => {
    try {
      drawable.el.pause();
    } catch {}
  });

  return new Blob([muxer.target.buffer], { type: "video/webm" });
}
