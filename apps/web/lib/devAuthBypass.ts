// 로컬 개발 전용 로그인 우회 스위치(임시).
// .env.local 에 NEXT_PUBLIC_DEV_AUTH_BYPASS=1 을 넣었을 때만 켜진다.
//
// 이중 잠금
// 1) 값이 실수로 배포 환경에 딸려가도 프로덕션 빌드에서는 NODE_ENV === "production" 이라
//    항상 false로 접힌다. 즉 dev 서버에서만 살아 있다(devAuthBypass.test.ts 에서 단언).
// 2) 정확히 문자열 "1" 일 때만 켜진다. "true"·"0"·빈 값은 모두 꺼짐으로 본다.
//
// 켜져 있으면 proxy.ts의 보호 경로 리다이렉트와 SessionExpiryBridge의
// 401 → /login 이동이 둘 다 꺼진다(둘 중 하나만 끄면 결국 로그인으로 튕긴다).
// e2e(playwright.config.ts)는 webServer.env 로 항상 "0"을 박아 우회가 꺼진 상태로 돈다.
export const DEV_AUTH_BYPASS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "1";
