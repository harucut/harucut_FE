// 서버가 주는 시각 문자열을 Date로 바꾼다.
//
// 백엔드는 `createdAt` 등을 LocalDateTime으로 직렬화해 **오프셋이 없는** 문자열을 준다
// (예: "2026-08-14T10:54:45.920636647"). 컨테이너 타임존이 UTC라 그 값의 실체는 UTC인데,
// JS `new Date("...")`는 오프셋 없는 날짜-시간을 **브라우저 로컬 시간**으로 해석한다.
// 한국(UTC+9)에서 그대로 파싱하면 9시간이 밀려 저녁에 저장한 기록이 오전으로 찍히고,
// 자정~오전 9시 기록은 전날로 계산돼 월/주 집계까지 어긋난다.
//
// 그래서 오프셋이 없으면 UTC로 못 박아 파싱한다.
// (백엔드가 Instant/OffsetDateTime으로 바꾸거나 컨테이너에 TZ를 지정하면 아래 분기 하나만 지우면 된다)

const HAS_TIMEZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

export function parseServerDateTime(
  value: string | null | undefined,
): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = HAS_TIMEZONE.test(trimmed) ? trimmed : `${trimmed}Z`;
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 시각 문자열을 밀리초로. 파싱 실패 시 0(정렬에서 맨 뒤로 밀린다). */
export function serverDateTimeToMillis(value: string | null | undefined): number {
  return parseServerDateTime(value)?.getTime() ?? 0;
}
