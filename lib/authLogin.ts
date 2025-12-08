const backendBase = process.env.NEXT_PUBLIC_BASE_URL;

export function loginKakao() {
  const kakaoAuthUrl = `${backendBase}/oauth2/authorization/kakao`;
  window.location.href = kakaoAuthUrl;
}

export function loginNaver() {
  const naverAuthUrl = `${backendBase}/oauth2/authorization/naver`;
  window.location.href = naverAuthUrl;
}
