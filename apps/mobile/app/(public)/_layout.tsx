import { Slot } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHarucutTheme } from '@/hooks/use-harucut-theme';

export default function PublicLayout() {
  const { colors } = useHarucutTheme();

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      <Slot />
    </SafeAreaView>
  );
}
