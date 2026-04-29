import 'react-native-reanimated';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GlobalNotice } from '@/components/harucut/global-notice';
import { GlobalThemeToggle } from '@/components/harucut/global-theme-toggle';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { useHarucutStore } from '@/store/use-harucut-store';

export default function RootLayout() {
  const { colors, isDark } = useHarucutTheme();
  const accessMode = useHarucutStore((state) => state.accessMode);

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
        <GlobalThemeToggle />
        <GlobalNotice />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
