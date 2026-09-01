// 웹/모바일이 공유하는 요금제 관련 에러 코드 문구.
// 서버 응답의 code 값을 사용자 문구로 바꾼다. 매핑에 없으면 각 화면의 폴백 문구를 쓴다.

export const PLAN_ERROR_MESSAGES: Record<string, string> = {
  // 서버 SubscriptionErrorCode 실측값. 보관 기간을 넘긴 기록/프레임에 접근할 때 403.
  'SUBS-002': '요금제에서 볼 수 있는 보관 기간을 넘긴 기록이에요.',
  // 프레임은 "월 생성 횟수"가 아니라 "보관 개수" 한도다(frameRetention* 계약 기준).
  // 무료(BASIC)는 한도가 0이라 첫 프레임부터 이 에러가 난다 — "다 썼다"가 아니라 "저장 불가"다.
  'SUBS-003':
    '지금 요금제로는 프레임을 저장할 수 없어요. 기존 프레임을 지우거나 플랜을 올려 주세요.',
  'SUBS-004': '이용 중인 구독이 없어요.',
  'SUBS-005': '이미 자동 갱신이 해지된 구독이에요.',
  'SUBS-006': '해지할 자동 갱신이 없어요.',
};

// 에러 코드에 대응하는 문구를 돌려준다. 모르는 코드면 null.
export function getPlanErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return PLAN_ERROR_MESSAGES[code] ?? null;
}
