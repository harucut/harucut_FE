import 'react-native-reanimated';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GlobalNotice } from '@/components/harucut/global-notice';
import { HARUCUT_COLORS } from '@/constants/harucut-design';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            animation: 'fade',
            contentStyle: { backgroundColor: HARUCUT_COLORS.background },
            headerShown: false,
          }}
        />
        <GlobalNotice />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
