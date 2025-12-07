export function loginKakao() {
  const backendBase = process.env.NEXT_PUBLIC_BASE_URL;
  const kakaoAuthUrl = `${backendBase}/oauth2/authorization/kakao`;

  window.location.href = kakaoAuthUrl;
}
