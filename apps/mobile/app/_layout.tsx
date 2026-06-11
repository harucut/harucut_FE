import 'react-native-reanimated';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GlobalNotice } from '@/components/harucut/global-notice';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { getAuthStatus } from '@/lib/auth-api';
import { useSessionStore } from '@/store/use-session-store';

export default function RootLayout() {
  const { colors, isDark } = useHarucutTheme();
  const accessMode = useSessionStore((state) => state.accessMode);
  const bootstrapMemberSession = useSessionStore((state) => state.bootstrapMemberSession);

  useEffect(() => {
    if (accessMode !== 'anonymous' || Platform.OS === 'web') {
      return;
    }

    let cancelled = false;

    const restoreSession = async () => {
      try {
        const status = await getAuthStatus();

        if (!cancelled && status?.userStatus === 'ACTIVE') {
          await bootstrapMemberSession();
        }
      } catch {
        // 저장된 서버 세션이 없으면 공개 화면으로 유지합니다.
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [accessMode, bootstrapMemberSession]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            animation: 'fade',
            contentStyle: { backgroundColor: colors.background },
            headerShown: false,
          }}
        >
          <Stack.Screen name="(public)" />
          <Stack.Protected guard={accessMode !== 'anonymous'}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
        <GlobalNotice />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
