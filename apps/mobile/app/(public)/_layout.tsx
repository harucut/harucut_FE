import { Slot } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HARUCUT_COLORS } from '@/constants/harucut-design';

export default function PublicLayout() {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: HARUCUT_COLORS.background, flex: 1 }}>
      <Slot />
    </SafeAreaView>
  );
}
