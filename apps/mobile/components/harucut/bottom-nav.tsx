import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_NAV_ITEMS } from '@/constants/harucut-data';
import { HARUCUT_COLORS, HARUCUT_RADII } from '@/constants/harucut-design';
import { useHarucutStore } from '@/store/use-harucut-store';

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
  const accessMode = useHarucutStore((state) => state.accessMode);
  const showGuestRestrictedNotice = useHarucutStore((state) => state.showGuestRestrictedNotice);
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
                    ? 'rgba(89, 112, 143, 0.58)'
                    : active
                      ? HARUCUT_COLORS.primaryStrong
                      : HARUCUT_COLORS.muted
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

const styles = StyleSheet.create({
  bar: {
    backgroundColor: HARUCUT_COLORS.cardStrong,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: HARUCUT_COLORS.shadow,
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 1,
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
    color: HARUCUT_COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  labelActive: {
    color: HARUCUT_COLORS.primaryStrong,
  },
  labelLocked: {
    color: 'rgba(89, 112, 143, 0.76)',
  },
  outer: {
    backgroundColor: HARUCUT_COLORS.background,
    borderTopColor: HARUCUT_COLORS.border,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
});
