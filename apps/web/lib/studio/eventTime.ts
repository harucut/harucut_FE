/**
 * 행사 촬영 기간 입력(`<input type="datetime-local">`) ↔ 서버 값(offset 붙은 ISO-8601).
 *
 * 지금은 시간대를 `Asia/Seoul` 하나로 둔다(+09:00, 일광절약 없음). 다른 시간대를 열 때는
 * offset 을 고정값으로 붙이는 이 방식이 틀려지므로 Intl 로 그 시각의 offset 을 구해야 한다.
 */
export const STUDIO_TIMEZONE = "Asia/Seoul";
const SEOUL_OFFSET = "+09:00";

/** `2026-10-27T10:00` → `2026-10-27T10:00:00+09:00`. 비었으면 null(= 즉시 시작 / 상시형). */
export function toServerDateTime(localValue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue)) return null;
  return `${localValue}:00${SEOUL_OFFSET}`;
}

/** `2026-10-27`(서울 날짜) → 그날 0시. 비었거나 형식이 틀리면 undefined. */
export function dayStartToServer(day: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00${SEOUL_OFFSET}` : undefined;
}

/** `2026-10-27`(서울 날짜) → 다음 날 0시. 서버의 `to` 는 미포함이라 그날 전체가 들어간다. */
export function dayEndToServer(day: string): string | undefined {
  const start = dayStartToServer(day);
  if (!start) return undefined;
  const next = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000);
  return Number.isNaN(next.getTime()) ? undefined : next.toISOString();
}

/** 서버 값 → 서울 기준 `YYYY-MM-DDTHH:mm`. 읽을 수 없으면 빈 문자열. */
export function toLocalInputValue(serverValue: string | null | undefined): string {
  if (!serverValue) return "";
  const date = new Date(serverValue);
  if (Number.isNaN(date.getTime())) return "";
  // sv-SE 는 `YYYY-MM-DD HH:mm` 모양으로 찍는다.
  const text = new Intl.DateTimeFormat("sv-SE", {
    timeZone: STUDIO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return text.replace(" ", "T");
}
