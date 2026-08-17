import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * 앱이 띄울 웹 주소.
 *
 * 앱은 더 이상 자기 화면을 그리지 않는다 — 이 웹을 그대로 띄우고, 웹이 못 하는 일
 * (사진첩 저장·공유 시트·햅틱)만 브리지로 받아 처리한다. 화면 한 벌이 두 플랫폼을 덮는다.
 *
 * 개발 중에는 로컬 Next 개발 서버를 본다. 안드로이드 에뮬레이터에서 호스트의 localhost 는
 * 10.0.2.2 다 — 그냥 localhost 를 쓰면 에뮬레이터 자기 자신을 가리켜 아무것도 안 뜬다.
 */
const DEFAULT_WEB_ORIGIN = 'https://www.harucut.com';

function fromEnv() {
  const value = process.env.EXPO_PUBLIC_WEB_ORIGIN?.trim();
  return value && value.length > 0 ? value : undefined;
}

function fromExtra() {
  const value = Constants.expoConfig?.extra?.webOrigin;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getWebOrigin() {
  return trimTrailingSlash(fromEnv() ?? fromExtra() ?? DEFAULT_WEB_ORIGIN);
}

/**
 * 셸임을 알리는 UA 토큰.
 *
 * 웹의 useExternalBrowserRedirect 가 인앱 브라우저를 밖으로 내보내는데, 이 토큰이 없으면
 * 우리 앱이 켜지자마자 자기 화면을 외부 크롬으로 내보내고 빈 껍데기만 남는다.
 */
export const SHELL_USER_AGENT_TOKEN = `harucutapp/${Constants.expoConfig?.version ?? '1.0.0'}`;

export const SHELL_PLATFORM: 'android' | 'ios' = Platform.OS === 'ios' ? 'ios' : 'android';
