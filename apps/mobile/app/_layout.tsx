import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/*
  앱은 세로 고정으로 시작한다 — 돌아가는 것은 촬영 화면뿐이다(lib/native-bridge.ts 의 setScreenOrientation).
  iOS 는 app.json 의 expo-screen-orientation 플러그인(initialOrientation)이 첫 화면부터 잠근다. 안드로이드는 그
  플러그인 값을 쓰지 않아(app.json orientation 이 default 라 매니페스트에 고정이 없다) 여기서 한 번 잠근다.
*/
void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);

/**
 * 앱 전체가 웹 셸 하나다.
 *
 * 예전에는 앱이 19개 라우트를 자기 화면으로 그렸다(screens/ 6,299줄). 그 화면들은 전부
 * 웹에 1:1 로 있었고 앱 전용 화면은 하나도 없었다. 두 벌을 유지하는 동안 로고 크기·브랜드색·
 * 버튼 순서·안내 문구가 계속 어긋났다 — 같은 변경을 두 번 구현하다 한쪽을 빼먹기 때문이다.
 *
 * 이제 화면은 웹 한 벌이고, 앱은 웹이 못 하는 것만 맡는다(사진첩 저장·공유·햅틱·뒤로가기·딥링크).
 * 경계는 components/harucut-web-shell.tsx 와 lib/native-bridge.ts 에 있다.
 *
 * expo-router 는 라우트가 하나뿐이라 라우팅 때문에 쓰는 것이 아니다. 엔트리(expo-router/entry)와
 * app.json 의 scheme 등록을 그대로 쓰려고 남긴다. `harucut://` 로 받는 것은 앱 로그인 콜백 하나뿐이고
 * 시스템 브라우저 세션이 직접 받는다(lib/app-login.ts). 라우터가 그 주소로 이동하지 않게
 * app/+native-intent.tsx 가 막는다.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/*
        상태바는 셸이 잡는다(components/harucut-web-shell.tsx). 여기서 고정하면 웹이
        라이트 테마일 때 흰 배경 위에 흰 글자가 된다 — 두 곳에서 켜면 나중에 마운트된
        쪽이 이기므로, 값을 아는 한 곳만 남긴다.
      */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0B0B0C' },
        }}
      />
    </SafeAreaProvider>
  );
}
