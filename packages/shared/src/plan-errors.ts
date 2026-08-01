// 웹/모바일이 공유하는 요금제 관련 에러 코드 문구.
// 서버 응답의 code 값을 사용자 문구로 바꾼다. 매핑에 없으면 각 화면의 폴백 문구를 쓴다.

export const PLAN_ERROR_MESSAGES: Record<string, string> = {
  // 프레임은 "월 생성 횟수"가 아니라 "보관 개수" 한도다(frameRetention* 계약 기준).
  'USR-102':
    '요금제의 프레임 보관 개수를 다 썼어요. 기존 프레임을 지우거나 플랜을 올려 주세요.',
  'USR-103': '요금제에서 볼 수 있는 기록 기간을 넘었어요.',
};

// 에러 코드에 대응하는 문구를 돌려준다. 모르는 코드면 null.
export function getPlanErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return PLAN_ERROR_MESSAGES[code] ?? null;
}
