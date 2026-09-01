import { componentImageSrc } from "@/lib/canvas/componentSource";
import { drawCover, type Rect } from "@/lib/canvas/draw";
import { drawTextComponent } from "@/lib/canvas/textLayer";
import { loadImage } from "@/lib/canvas/loaders";
import { nativeSaveImageBlob, nativeSaveImageUrl } from "@/lib/nativeBridge";
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

export type FrameSource = { src: string };

type SlotDrawable = { el: HTMLImageElement };

type OverlayImageMap = Map<string, HTMLImageElement>;

/**
 * 한 캔버스가 가질 수 있는 픽셀 수의 안전선.
 *
 * 확인된 것 — 이 상한은 우리 레이아웃 두 개를 겨냥해 일부러 잡은 값이다.
 * 가로 4컷 6000×4000 과 세로형 4000×6000 이 **24MP** 로, 여기서만 축소가 걸린다
 * (클래식 2000×6000 은 12MP 라 그대로 나간다). 넘으면 비율을 지킨 채 줄인다 —
 * 24MP → 16MP 는 한 변으로 0.82 배라 6000×4000 이 4898×3265 가 된다.
 * 인화·보관에는 여전히 충분한 해상도다.
 *
 * 가정 — 왜 하필 16MP 인가는 아직 증명되지 않았다. iOS Safari 가 캔버스 넓이
 * 2^24(16,777,216)px 를 넘으면 오류 없이 빈 캔버스를 그리거나 toBlob 이 null 을
 * 준다는 이야기를 근거로, 거기에 딱 붙이지 않고 조금 아래에 둔 것이다.
 * **실기기로 확인한 적이 없다.** 2026-09-01 데스크톱 WebKit 에서는 24MP 캔버스가
 * 멀쩡히 그려지고 인코딩됐다 — 데스크톱에서는 재현되지 않는다는 것까지만 안다.
 *
 * 그래도 상한을 걷지 않는 이유는 비용이 비대칭이라서다. 가정이 맞는데 걷으면
 * 완성 단계가 빈 이미지로 끝나고, 가정이 틀린 채 두면 해상도 0.82 배를 잃을 뿐이다.
 * 값을 올리거나 내리려면 진짜 아이폰에서 재현/반증부터 해야 한다.
 */
const MAX_CANVAS_PIXELS = 16_000_000;

/** 넓이 상한에 맞춘 축소 배율. 상한 안이면 1. */
export function fitCanvasScale(width: number, height: number) {
  const pixels = width * height;
  if (pixels <= MAX_CANVAS_PIXELS) return 1;
  return Math.sqrt(MAX_CANVAS_PIXELS / pixels);
}

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

/**
 * 결과물을 기기에 저장한다.
 *
 * 앱 셸(WebView) 안에서는 `<a download>` 가 아무 일도 하지 않는다 — 안드로이드 WebView 는
 * download 속성을 무시하고 blob 은 DownloadListener 로도 못 받으며, iOS WKWebView 에는
 * 저장 UI 자체가 없다. 그래서 셸 안이면 네이티브에 넘겨 사진첩에 저장한다.
 * 브라우저에서는 예전과 똑같이 링크를 만들어 누른다.
 */
export async function downloadBlob(blob: Blob, filename: string) {
  const native = await nativeSaveImageBlob(blob, filename);
  if (native) {
    if (!native.ok) throw new Error(native.reason ?? "사진첩에 저장하지 못했어요.");
    return;
  }

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
  const name = filename ?? filenameFromUrl(url);

  // 앱 셸 안이면 주소만 넘긴다 — 네이티브가 직접 내려받아 사진첩에 넣는다.
  // 웹이 fetch 로 받아 base64 로 쪼개 보내는 것보다 훨씬 싸다.
  const native = await nativeSaveImageUrl(url, name);
  if (native) {
    if (!native.ok) throw new Error(native.reason ?? "사진첩에 저장하지 못했어요.");
    return;
  }

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(`download failed: ${res.status}`);
    }

    const blob = await res.blob();
    await downloadBlob(blob, name);
  } catch {
    triggerDownloadLink(url, filename);
  }
}

async function loadDrawables(sources: FrameSource[]): Promise<SlotDrawable[]> {
  return Promise.all(
    sources.map(async (source) => {
      const image = await loadImage(source.src);
      return { el: image };
    }),
  );
}

async function loadOverlayImages(theme: ThemeExportJson | null) {
  const map: OverlayImageMap = new Map();
  if (!theme) return map;

  const sources = Array.from(
    new Set(
      theme.components
        .filter((component) => component.type !== "TEXT")
        .map((component) => componentImageSrc(component)),
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
      drawTextComponent(ctx, component.source, component.width, component.styleJson);
      ctx.restore();
      return;
    }

    const image = overlayImages.get(componentImageSrc(component));
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
  // 누끼는 **여기서 그리지 않는다.** 예전에는 `cellCutouts` 가 켜진 칸에 방사형 비네트 +
  // 초록 링을 얹었는데, 그건 배경 제거가 아니라 이름만 누끼인 시각 효과였다.
  // 실제 배경 제거는 촬영 사진 픽셀에 미리 구워지고(`lib/canvas/personCutout.ts`),
  // 합성기는 이미 구워진 사진을 슬롯에 그대로 깐다.
  // `cellCutouts` 플래그는 남는다 — 어느 칸을 구울지 저장·복원하는 데이터이지
  // 여기서 그릴 값이 아니다(계약은 docs/backend-contract.md).
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
  // 캔버스 넓이 상한(MAX_CANVAS_PIXELS — 왜 그 값인지는 거기 적어 뒀다)을 넘지 않게 줄인다.
  // 그리는 좌표는 레이아웃 원본 크기 그대로 두고 컨텍스트에 배율만 걸어,
  // 그리는 쪽 코드는 상한을 몰라도 되게 한다.
  const outputScale = fitCanvasScale(layout.totalWidth, layout.totalHeight);
  // 올림하면 상한을 다시 넘긴다 — 6000×4000 은 4899×3266 = 16,000,134 로 134px 초과다.
  canvas.width = Math.floor(layout.totalWidth * outputScale);
  canvas.height = Math.floor(layout.totalHeight * outputScale);

  const ctx = ensureCtx(canvas);
  if (outputScale !== 1) ctx.scale(outputScale, outputScale);
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
