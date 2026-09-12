// 서버가 주는 시각 문자열을 Date로 바꾼다.
//
// 백엔드는 이제 오프셋을 붙여 준다(예: "2026-08-16T00:42:06.070170+09:00").
// 오프셋이 있으면 `new Date()`가 정확히 해석하므로 그대로 넘긴다.
//
// 오프셋이 없는 문자열은 UTC로 못 박아 파싱한다. JS는 오프셋 없는 날짜-시간을
// **브라우저 로컬 시간**으로 해석해서, 한국(UTC+9)에서는 9시간이 밀리고 자정~오전 9시
// 기록이 전날로 계산돼 월/주 집계까지 어긋나기 때문이다. 예전 백엔드가 그렇게 내려줬고,
// 캐시에 남은 값이나 아직 갱신되지 않은 배포가 있을 수 있어 이 분기는 남겨 둔다.

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
