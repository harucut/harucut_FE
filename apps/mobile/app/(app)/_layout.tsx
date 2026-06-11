import { Slot, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { BottomNavigation } from '@/components/harucut/bottom-nav';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { useSessionStore } from '@/store/use-session-store';

export default function AppLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const accessMode = useSessionStore((state) => state.accessMode);
  const showGuestRestrictedNotice = useSessionStore((state) => state.showGuestRestrictedNotice);
  const { colors } = useHarucutTheme();
  const shouldHideRoute = accessMode === 'guest' && !pathname.startsWith('/shoot');

  useEffect(() => {
    if (accessMode !== 'guest') {
      return;
    }

    if (pathname.startsWith('/shoot')) {
      return;
    }

    showGuestRestrictedNotice();
    router.replace('/shoot' as never);
  }, [accessMode, pathname, router, showGuestRestrictedNotice]);

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        <View pointerEvents={shouldHideRoute ? 'none' : 'auto'} style={{ flex: 1, opacity: shouldHideRoute ? 0 : 1 }}>
          <Slot />
        </View>
        {shouldHideRoute ? null : <BottomNavigation />}
      </View>
    </SafeAreaView>
  );
}
