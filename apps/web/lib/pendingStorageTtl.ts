/**
 * 브라우저에 잠깐 맡겨 둔 보관물의 **기한 판정**. 이 규칙의 소유자는 이 파일이다.
 *
 * 게스트 인계(`pendingGuestSave.ts`)와 약관 동의(`pendingTermsConsent.ts`)가 같이 쓴다.
 * 둘 다 하루 뒤에는 없어야 하는 값이고, 둘 다 **공용 기기에서 앞사람의 것이 뒷사람에게
 * 넘어가지 않게** 하려고 기한을 둔다 — 판정이 두 벌이면 한쪽만 고쳐지고 갈라진다.
 */

/**
 * 기기 시계가 앞서 있어도 봐주는 폭. 이보다 더 미래면 값이 성하지 않은 것으로 본다.
 *
 * 미래 시각을 그대로 두면 `now - savedAt` 이 늘 음수라 기한이 영영 오지 않는다.
 * 시계는 늘 조금씩 틀리므로 작은 오차까지 버리지는 않는다.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * 이 보관물을 아직 써도 되는가.
 *
 * `savedAt` 이 **성한 숫자가 아니면 false** 다. 예전에는 숫자일 때만 기한을 봤는데, 그러면
 * 값이 없거나 `NaN`·문자열인 레코드가 기한 검사를 통째로 건너뛰고 정상으로 돌아온다 —
 * 기한을 둔 이유가 그 자리에서 사라진다. 마이그레이션한 옛 형식이나 깨진 레코드가
 * 그렇게 될 수 있다.
 */
export function isFreshSavedAt(
  savedAt: unknown,
  now: number,
  ttlMs: number,
): boolean {
  if (!Number.isFinite(savedAt)) return false;

  const age = now - (savedAt as number);

  return age <= ttlMs && age >= -CLOCK_SKEW_TOLERANCE_MS;
}
