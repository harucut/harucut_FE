import { appLoginIntentPath } from '@harucut/shared';

/**
 * 들어오는 링크를 라우터가 어떻게 받을지(라우트가 아니다 — expo-router 의 특수 파일).
 *
 * 앱 로그인 콜백 `harucut://oauth2/callback?code=…` 는 시스템 브라우저 세션(lib/app-login.ts)이 받는다.
 * 안드로이드에서는 같은 주소가 일반 링크 이벤트로도 와서, 그대로 두면 라우터가 그 경로로 이동해
 * 「없는 화면」이 뜬다(Codex #562). 판정은 @harucut/shared 의 appLoginIntentPath 가 갖는다.
 * 여기서 던지면 앱이 죽을 수 있어 감싼다.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    return appLoginIntentPath(path, initial);
  } catch {
    return initial ? '/' : null;
  }
}
