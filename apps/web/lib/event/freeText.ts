/**
 * 참가자 자유 문구(D06, 서버 렌더). 참가자는 문자열과 스타일 id 만 보낸다 — 미리보기도 최종 합성도 같은 서버
 * 렌더러가 만든 같은 PNG 다. 글자 크기·줄바꿈 맞춤은 서버가 정하므로 여기서는 미리 걸러 낼 수 있는 것
 * (빈 문구·글자 수·줄 수)만 본다. 나머지(폰트에 없는 글자, 칸에 안 들어감)는 서버의 PART-008 이 알려 준다.
 */

/** 캔버스 대비 비율(0~1). 레이아웃마다 캔버스 크기가 달라 px 로 두지 않는다. */
export type FreeTextBox = { x: number; y: number; width: number; height: number };

export type TextStyle = { id: string; label: string; weight: number; color: string };

/** Studio 행사 설정. enabled:false 는 이 단계에서 명시적으로 끈 것(위 단계 기본값이 켰어도 끈다). */
export type FreeTextSettings =
  | { enabled: false }
  | { enabled: true; box: FreeTextBox; styleIds: string[]; maxLength?: number; maxLines?: number };

/** 공개 행사 조회의 freeText — 없으면 이 행사는 문구를 바꿀 수 없다(FIXED). */
export type PublicFreeText = {
  box: FreeTextBox;
  maxLength: number;
  maxLines: number;
  styles: TextStyle[];
};

export type TextPreview = {
  text: string;
  styleId: string;
  /** data:image/png;base64,… */
  image: string;
  /** 이 프레임 캔버스 px. */
  x: number;
  y: number;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
};

export const FREE_TEXT_DEFAULT_MAX_LENGTH = 20;
export const FREE_TEXT_LIMITS = { maxLength: [1, 30], maxLines: [1, 3] } as const;

/** 줄바꿈을 빼고 센 글자 수(서버와 같이 코드 포인트로 센다 — 한글 한 자는 1). */
export function freeTextLength(text: string) {
  return Array.from(text.replace(/\r?\n/g, "")).length;
}

export function freeTextLines(text: string) {
  return text.split(/\r?\n/).length;
}

/** 보내기 전에 걸러 낼 수 있는 문제. 없으면 null. 문구는 서버 PART-008 과 같은 것을 쓴다. */
export function localFreeTextProblem(text: string, limits: { maxLength: number; maxLines: number }): string | null {
  if (text.trim() === "") return FREE_TEXT_REASON_COPY.EMPTY(limits);
  if (freeTextLength(text) > limits.maxLength) return FREE_TEXT_REASON_COPY.TOO_LONG(limits);
  if (freeTextLines(text) > limits.maxLines) return FREE_TEXT_REASON_COPY.TOO_MANY_LINES(limits);
  return null;
}

type Limits = { maxLength?: number; maxLines?: number };

const FREE_TEXT_REASON_COPY: Record<string, (limits: Limits) => string> = {
  EMPTY: () => "문구를 입력해 주세요.",
  TOO_LONG: ({ maxLength }) => (maxLength ? `${maxLength}자까지 쓸 수 있어요.` : "문구가 너무 길어요."),
  TOO_MANY_LINES: ({ maxLines }) => (maxLines ? `${maxLines}줄까지 쓸 수 있어요.` : "줄이 너무 많아요."),
  UNSUPPORTED_CHARACTER: () => "쓸 수 없는 글자가 있어요. 이모지나 특수 기호를 빼 주세요.",
  STYLE_NOT_OFFERED: () => "고를 수 없는 글꼴이에요. 다른 글꼴을 골라 주세요.",
  DOES_NOT_FIT: () => "문구가 너무 길어 칸에 들어가지 않아요. 줄여 주세요.",
};

export const FREE_TEXT_INVALID_CODE = "PART-008";
export const FREE_TEXT_NOT_ALLOWED_CODE = "PART-007";

/** 400 PART-008 이면 data.reason 에 맞는 문구. 다른 오류면 null — 호출부가 일반 문구를 고른다. */
export function freeTextErrorMessage(error: unknown): string | null {
  const envelope = (error as { data?: { code?: unknown; data?: { reason?: unknown; maxLength?: unknown; maxLines?: unknown } } })
    .data;
  if (envelope?.code !== FREE_TEXT_INVALID_CODE) return null;
  const data = envelope.data;
  const copy = typeof data?.reason === "string" ? FREE_TEXT_REASON_COPY[data.reason] : undefined;
  if (!copy) return "문구를 다시 확인해 주세요.";
  return copy({
    maxLength: typeof data?.maxLength === "number" ? data.maxLength : undefined,
    maxLines: typeof data?.maxLines === "number" ? data.maxLines : undefined,
  });
}
