import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
 * expo-router 는 라우팅이 아니라 **딥링크 등록** 때문에 남긴다 — harucut:// 는 소셜 로그인
 * 복귀 경로이고, 앱 스킴이 사라지면 그 길이 끊긴다. 라우트는 index 하나뿐이다.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* 웹이 자기 배경을 그린다. 상태바는 어두운 무대에 맞춰 밝은 글자로 고정. */}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0B0B0C' },
        }}
      />
    </SafeAreaProvider>
  );
}
