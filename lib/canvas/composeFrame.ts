import { drawCover, type Rect } from "@/lib/canvas/draw";
import { loadImage, loadVideo } from "@/lib/canvas/loaders";

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

// 프레임 배경 + 슬롯 이미지/비디오 1회 그리기
function drawFrameOnce(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  borderColor: string,
  drawables: SlotDrawable[],
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
}

/**
 * 선택된 슬롯을 합성해 PNG Blob 생성
 */
export async function composeFramePng(opts: {
  layout: FrameLayout;
  borderColor: string;
  sources: FrameSource[]; // 반드시 슬롯 개수만큼
  canvas?: HTMLCanvasElement;
}) {
  const { layout, borderColor, sources } = opts;

  if (sources.length !== layout.slots.length) {
    throw new Error("sources length must match slot count");
  }

  const canvas = opts.canvas ?? document.createElement("canvas");
  canvas.width = layout.totalWidth;
  canvas.height = layout.totalHeight;

  const ctx = ensureCtx(canvas);
  const drawables = await loadDrawables(sources);

  drawFrameOnce(ctx, layout, borderColor, drawables);

  return toPngBlob(canvas);
}

/**
 * 선택된 슬롯을 합성해 WEBM 영상 Blob 생성
 */
export async function recordFrameWebm(opts: {
  layout: FrameLayout;
  borderColor: string;
  sources: FrameSource[]; // image/video 섞여도 됨
  seconds: number;
  fps?: number;
  canvas?: HTMLCanvasElement;
}) {
  const { layout, borderColor, sources, seconds } = opts;

  if (sources.length !== layout.slots.length) {
    throw new Error("sources length must match slot count");
  }

  const fps = opts.fps ?? 30;

  const canvas = opts.canvas ?? document.createElement("canvas");
  canvas.width = layout.totalWidth;
  canvas.height = layout.totalHeight;

  const ctx = ensureCtx(canvas);
  const drawables = await loadDrawables(sources);

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

      drawFrameOnce(ctx, layout, borderColor, drawables);

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
