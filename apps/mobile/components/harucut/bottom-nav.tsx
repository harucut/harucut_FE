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
  if (pathname.startsWith('/theme')) return 'theme';
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
    <View style={[styles.bar, { height: 74 + Math.max(insets.bottom, 0), paddingBottom: 10 + Math.max(insets.bottom, 0) }]}>
      {BOTTOM_NAV_ITEMS.map((item) => {
        const active = item.key === currentKey;
        const locked = accessMode === 'guest' && item.key !== 'shoot';
        const isCenter = 'center' in item && item.center;

        const handlePress = () => {
          if (locked) {
            showGuestRestrictedNotice();
            return;
          }

          push(item.href);
        };

        if (isCenter) {
          return (
            <Pressable
              key={item.key}
              accessibilityLabel={`촬영${active ? ', 현재 탭' : ''}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={handlePress}
              style={styles.fab}>
              <Ionicons color={colors.text} name={item.iconActive} size={26} />
            </Pressable>
          );
        }

        return (
          <Pressable
            key={item.key}
            accessibilityLabel={`${item.label}${active ? ', 현재 탭' : ''}${locked ? ', 로그인 후 이용 가능' : ''}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={handlePress}
            style={[styles.item, locked ? styles.itemLocked : null]}>
            <Ionicons
              color={
                locked
                  ? isDark
                    ? 'rgba(148, 163, 184, 0.58)'
                    : 'rgba(89, 112, 143, 0.58)'
                  : active
                    ? colors.text
                    : colors.muted
              }
              name={active ? item.iconActive : item.icon}
              size={23}
            />
            <Text style={[styles.label, active ? styles.labelActive : null, locked ? styles.labelLocked : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: HarucutColors, isDark: boolean) {
  return StyleSheet.create({
    // 핸드오프 TabBar: 높이 74(세이프에어리어 가산), --card 배경, 상단 1px 보더, 좌우 균등 분포.
    bar: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 10,
    },
    // 중앙 촬영 FAB: 54x54 원형 그린, 위로 26 돌출, 그림자.
    fab: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 27,
      elevation: 8,
      height: 54,
      justifyContent: 'center',
      marginTop: -26,
      shadowColor: colors.primary,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
      width: 54,
    },
    item: {
      alignItems: 'center',
      borderRadius: HARUCUT_RADII.md,
      gap: 3,
      width: 56,
    },
    itemLocked: {
      opacity: 0.72,
    },
    label: {
      color: colors.muted,
      fontSize: 10.5,
      fontWeight: '500',
    },
    labelActive: {
      color: colors.text,
      fontWeight: '700',
    },
    labelLocked: {
      color: isDark ? 'rgba(148, 163, 184, 0.76)' : 'rgba(89, 112, 143, 0.76)',
    },
  });
}
