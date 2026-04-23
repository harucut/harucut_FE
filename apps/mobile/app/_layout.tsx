import 'react-native-reanimated';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GlobalNotice } from '@/components/harucut/global-notice';
import { GlobalThemeToggle } from '@/components/harucut/global-theme-toggle';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';

export default function RootLayout() {
  const { colors, isDark } = useHarucutTheme();

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
        />
        <GlobalThemeToggle />
        <GlobalNotice />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
