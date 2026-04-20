import { Slot, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { BottomNavigation } from '@/components/harucut/bottom-nav';
import { HARUCUT_COLORS } from '@/constants/harucut-design';
import { useHarucutStore } from '@/store/use-harucut-store';

export default function AppLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const accessMode = useHarucutStore((state) => state.accessMode);
  const showGuestRestrictedNotice = useHarucutStore((state) => state.showGuestRestrictedNotice);

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
    <SafeAreaView edges={['top']} style={{ backgroundColor: HARUCUT_COLORS.background, flex: 1 }}>
      <View style={{ backgroundColor: HARUCUT_COLORS.background, flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
        <BottomNavigation />
      </View>
    </SafeAreaView>
  );
}
