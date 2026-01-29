const backendBase = process.env.NEXT_PUBLIC_BASE_URL;

/** 카카오 OAuth 로그인 시작 */
export function loginKakao() {
  const kakaoAuthUrl = `${backendBase}/oauth2/authorization/kakao`;
  window.location.href = kakaoAuthUrl;
}

/** 네이버 OAuth 로그인 시작 */
export function loginNaver() {
  const naverAuthUrl = `${backendBase}/oauth2/authorization/naver`;
  window.location.href = naverAuthUrl;
}
