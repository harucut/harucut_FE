"use client";

/**
 * 프레임에 얹은 글자(TEXT)를 그리는 규칙 한 벌.
 *
 * 같은 글자를 세 곳에서 그린다 — 에디터 캔버스, 미리보기 PNG, 로컬 합성. 거기에
 * **서버 합성용으로 구운 PNG**까지 넷이다. 규칙이 갈리면 사용자가 편집 화면에서 본 것과
 * 저장된 결과가 어긋나므로, 폰트·정렬·줄간격 계산을 여기 한 곳에만 둔다.
 *
 * ## 왜 굽는가
 *
 * 서버는 글자를 그리지 않는다. 브라우저와 서버가 폰트를 다르게 그려 편집 화면과 결과물이
 * 어긋나는 걸 막으려고, **사용자가 본 픽셀을 그대로** 올리게 되어 있다(스웨거).
 * 구운 PNG 의 S3 key 를 `renderedKey` 로 함께 보내지 않으면 그 프레임으로 네컷 합성이
 * 400 GEN-002 로 거부된다.
 */

export type ResolvedTextStyle = {
  fontFamily: string;
  fontSize: number;
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
};

/** 글자 스타일 기본값. 편집기에서 값이 빠져 있어도 세 렌더가 같은 것을 쓰게 한다. */
export function resolveTextStyle(
  styleJson: Record<string, unknown> | undefined | null,
): ResolvedTextStyle {
  const style = styleJson ?? {};
  const fontFamily =
    typeof style.fontFamily === "string" ? style.fontFamily : "Pretendard";
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : 128;
  const fill = typeof style.color === "string" ? style.color : "#ffffff";
  const align =
    style.textAlign === "center" || style.textAlign === "right"
      ? style.textAlign
      : "left";

  return {
    fontFamily,
    fontSize,
    fill,
    align,
    lineHeight: Math.max(1, Math.round(fontSize * 1.15)),
  };
}

/**
 * 글자를 원점 기준 `width` 폭 안에 그린다.
 * 호출부가 이미 위치·회전·배율을 적용해 둔 상태여야 한다.
 */
export function drawTextComponent(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  styleJson: Record<string, unknown> | undefined | null,
): void {
  const { fontFamily, fontSize, fill, align, lineHeight } =
    resolveTextStyle(styleJson);

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = fill;
  ctx.textBaseline = "top";
  ctx.textAlign = align;

  const textX = align === "center" ? width / 2 : align === "right" ? width : 0;

  text.split("\n").forEach((line, index) => {
    ctx.fillText(line, textX, index * lineHeight);
  });
}

/**
 * 글자 층만 투명 PNG 로 굽는다.
 *
 * 캔버스 크기는 컴포넌트의 **원래 크기**(width×height)다. 위치·회전·배율은 넣지 않는다 —
 * 서버가 그 값들로 이 그림을 배치하므로, 여기서 미리 적용하면 두 번 적용된다.
 * 불투명도도 넣지 않는다(사진·스티커와 같이 배치 단계에서 다뤄지는 값이다).
 *
 * 글자가 상자보다 크면 잘린다. 서버도 width×height 로만 배치할 수 있으니 이게 사실이다
 * (에디터가 글자에 맞춰 상자를 자동으로 키우므로 보통은 딱 맞는다).
 */
export async function bakeTextLayerPng(component: {
  source: string;
  width: number;
  height: number;
  styleJson?: Record<string, unknown>;
}): Promise<Blob> {
  const width = Math.max(1, Math.round(component.width));
  const height = Math.max(1, Math.round(component.height));

  // 폰트가 아직 안 왔으면 캔버스가 기본 글꼴로 그려 버린다. 편집 화면과 달라지는
  // 가장 흔한 원인이라 여기서 한 번 기다린다.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context not available");

  drawTextComponent(ctx, component.source, width, component.styleJson);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      // 투명도를 살려야 하므로 PNG 다(JPEG 은 알파가 없어 배경이 검게 찍힌다).
      if (!blob) return reject(new Error("text layer blob create failed"));
      resolve(blob);
    }, "image/png");
  });
}
