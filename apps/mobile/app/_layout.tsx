import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
 * app.json 의 scheme 등록을 그대로 쓰려고 남긴다. `harucut://` 는 **아직 받는 코드가 없다** —
 * 소셜 로그인은 WebView 안에서 시작해 WebView 안에서 끝나고(constants/shell.ts 의 OAuth 판정),
 * 앱은 Linking 으로 밖으로 내보내기만 한다. 딥링크를 실제로 쓰게 되면 여기에 핸들러가 붙는다.
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
