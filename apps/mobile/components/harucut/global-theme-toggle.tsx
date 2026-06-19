import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname } from 'expo-router';
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  HarucutColors,
  HarucutThemePreference,
} from '@/constants/harucut-design';
import {
  GLOBAL_THEME_TOGGLE_HEIGHT,
  getGlobalThemeToggleBottomOffset,
} from '@/constants/overlay-ui';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { useSessionStore } from '@/store/use-session-store';

const THEME_OPTIONS: {
  icon: string;
  label: string;
  value: HarucutThemePreference;
}[] = [
  {
    icon: 'phone-portrait-outline',
    label: '기본값',
    value: 'system',
  },
  {
    icon: 'sunny-outline',
    label: '라이트',
    value: 'light',
  },
  {
    icon: 'moon-outline',
    label: '다크',
    value: 'dark',
  },
];

function currentThemeChipLabel(
  preference: HarucutThemePreference,
  scheme: 'light' | 'dark',
) {
  if (preference === 'system') {
    return '기본값';
  }

  return scheme === 'dark' ? '다크' : '라이트';
}

function currentThemeChipIcon(
  preference: HarucutThemePreference,
  scheme: 'light' | 'dark',
) {
  if (preference === 'system') {
    return 'phone-portrait-outline';
  }

  return scheme === 'dark' ? 'moon-outline' : 'sunny-outline';
}

export function GlobalThemeToggle() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors, isDark, preference, scheme } = useHarucutTheme();
  const setThemePreference = useSessionStore((state) => state.setThemePreference);
  const [open, setOpen] = React.useState(false);
  const styles = React.useMemo(
    () => createStyles(colors, isDark),
    [colors, isDark],
  );
  const bottom = getGlobalThemeToggleBottomOffset(pathname, insets.bottom);
  const chipLabel = currentThemeChipLabel(preference, scheme);
  const chipIcon = currentThemeChipIcon(preference, scheme);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open ? (
        <Pressable
          accessibilityLabel="테마 선택 닫기"
          onPress={() => setOpen(false)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <View pointerEvents="box-none" style={[styles.anchor, { bottom }]}>
        {open ? (
          <View style={styles.menu}>
            {THEME_OPTIONS.map((option) => {
              const active = preference === option.value;

              return (
                <Pressable
                  key={option.value}
                  accessibilityLabel={`${option.label} 테마 적용`}
                  onPress={() => {
                    setThemePreference(option.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.menuItem,
                    active ? styles.menuItemActive : null,
                    pressed ? styles.menuItemPressed : null,
                  ]}>
                  <View style={styles.menuItemMain}>
                    <Ionicons
                      color={active ? colors.primary : colors.muted}
                      name={option.icon as any}
                      size={16}
                    />
                    <Text
                      style={[
                        styles.menuItemLabel,
                        active ? styles.menuItemLabelActive : null,
                      ]}>
                      {option.label}
                    </Text>
                  </View>
                  <Ionicons
                    color={active ? colors.primary : colors.muted}
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Pressable
          accessibilityLabel="전역 테마 전환"
          onPress={() => setOpen((current) => !current)}
          style={({ pressed }) => [
            styles.trigger,
            open ? styles.triggerActive : null,
            pressed ? styles.triggerPressed : null,
          ]}>
          <Ionicons
            color={open ? colors.primaryStrong : colors.text}
            name={chipIcon as any}
            size={18}
          />
          <Text
            style={[
              styles.triggerLabel,
              open ? styles.triggerLabelActive : null,
            ]}>
            {chipLabel}
          </Text>
          <Ionicons
            color={open ? colors.primaryStrong : colors.muted}
            name={open ? 'close-outline' : 'chevron-up-outline'}
            size={16}
          />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: HarucutColors, isDark: boolean) {
  return StyleSheet.create({
    anchor: {
      alignItems: 'flex-end',
      left: 16,
      position: 'absolute',
      right: 16,
    },
    menu: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      gap: 8,
      marginBottom: 12,
      maxWidth: 220,
      minWidth: 178,
      padding: 10,
      shadowColor: colors.shadow,
      shadowOffset: { height: 20, width: 0 },
      shadowOpacity: isDark ? 0.34 : 1,
      shadowRadius: 28,
    },
    menuItem: {
      alignItems: 'center',
      borderRadius: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 40,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    menuItemActive: {
      backgroundColor: colors.primarySoft,
      borderColor: isDark
        ? 'rgba(30, 215, 96, 0.18)'
        : 'rgba(30, 215, 96, 0.14)',
      borderWidth: 1,
    },
    menuItemLabel: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    menuItemLabelActive: {
      color: colors.primaryStrong,
    },
    menuItemMain: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    menuItemPressed: {
      opacity: 0.88,
    },
    trigger: {
      alignItems: 'center',
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      height: GLOBAL_THEME_TOGGLE_HEIGHT,
      justifyContent: 'center',
      minWidth: 118,
      paddingHorizontal: 16,
      shadowColor: colors.shadow,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: isDark ? 0.34 : 1,
      shadowRadius: 30,
    },
    triggerActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    triggerLabel: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    triggerLabelActive: {
      color: colors.primaryStrong,
    },
    triggerPressed: {
      opacity: 0.9,
    },
  });
}
