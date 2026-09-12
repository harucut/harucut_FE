// 서버 Provider enum(GOOGLE/KAKAO/NAVER/APPLE/HARUCUT)을 사용자에게 보여줄 이름으로 바꾼다.
// 원문 enum을 그대로 노출하면 화면에 "GOOGLE" 같은 대문자 영문이 뜬다.

export const LOGIN_PLATFORM_LABELS: Record<string, string> = {
  APPLE: '애플',
  GOOGLE: '구글',
  HARUCUT: '이메일',
  KAKAO: '카카오',
  NAVER: '네이버',
};

export function getLoginPlatformLabel(
  platform: string | null | undefined,
): string {
  if (!platform) return LOGIN_PLATFORM_LABELS.HARUCUT;
  return LOGIN_PLATFORM_LABELS[platform] ?? platform;
}
