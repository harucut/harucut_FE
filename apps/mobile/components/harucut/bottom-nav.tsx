import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_NAV_ITEMS } from '@/constants/harucut-data';
import { HARUCUT_RADII, type HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { useSessionStore } from '@/store/use-session-store';

function activeKey(pathname: string) {
  if (pathname.startsWith('/shoot')) return 'shoot';
  if (pathname.startsWith('/upload')) return 'upload';
  if (pathname.startsWith('/history')) return 'history';
  if (pathname.startsWith('/mypage')) return 'mypage';
  return 'home';
}

export function BottomNavigation() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const accessMode = useSessionStore((state) => state.accessMode);
  const showGuestRestrictedNotice = useSessionStore((state) => state.showGuestRestrictedNotice);
  const { colors, isDark } = useHarucutTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const currentKey = activeKey(pathname);
  const push = (path: string) => router.push(path as never);

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active = item.key === currentKey;
          const locked = accessMode === 'guest' && item.key !== 'shoot';

          return (
            <Pressable
              key={item.key}
              accessibilityLabel={`${item.label}${active ? ', 현재 탭' : ''}${locked ? ', 로그인 후 이용 가능' : ''}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (locked) {
                  showGuestRestrictedNotice();
                  return;
                }

                push(item.href);
              }}
              style={[styles.item, locked ? styles.itemLocked : null]}>
              <Ionicons
                color={
                  locked
                    ? isDark
                      ? 'rgba(148, 163, 184, 0.58)'
                      : 'rgba(89, 112, 143, 0.58)'
                    : active
                      ? colors.primaryStrong
                      : colors.muted
                }
                name={active ? item.iconActive : item.icon}
                size={22}
              />
              <Text style={[styles.label, active ? styles.labelActive : null, locked ? styles.labelLocked : null]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: HarucutColors, isDark: boolean) {
  return StyleSheet.create({
    bar: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 30,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 8,
      shadowColor: colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: isDark ? 0.3 : 1,
      shadowRadius: 30,
    },
    item: {
      alignItems: 'center',
      borderRadius: HARUCUT_RADII.md,
      flex: 1,
      gap: 4,
      paddingVertical: 7,
    },
    itemLocked: {
      opacity: 0.72,
    },
    label: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '700',
    },
    labelActive: {
      color: colors.primaryStrong,
    },
    labelLocked: {
      color: isDark ? 'rgba(148, 163, 184, 0.76)' : 'rgba(89, 112, 143, 0.76)',
    },
    outer: {
      backgroundColor: colors.background,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      paddingHorizontal: 16,
      paddingTop: 10,
    },
  });
}
