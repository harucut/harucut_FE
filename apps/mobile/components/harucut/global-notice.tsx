import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Pill } from '@/components/harucut/ui';
import type { HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { useSessionStore } from '@/store/use-session-store';

export function GlobalNotice() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notice = useSessionStore((state) => state.notice);
  const clearNotice = useSessionStore((state) => state.clearNotice);
  const enterAnonymousMode = useSessionStore((state) => state.enterAnonymousMode);
  const enterGuestMode = useSessionStore((state) => state.enterGuestMode);
  const { colors, isDark } = useHarucutTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (!notice) {
    return null;
  }

  const replace = (path: string) => router.replace(path as never);

  const handleAction = (actionId: string) => {
    switch (actionId) {
      case 'dismiss':
        clearNotice();
        return;
      case 'go-login':
        clearNotice();
        replace('/login');
        return;
      case 'go-shoot':
        clearNotice();
        replace('/shoot');
        return;
      case 'go-landing':
        enterAnonymousMode();
        replace('/');
        return;
      case 'start-guest-trial':
        enterGuestMode();
        replace('/shoot');
        return;
      default:
        clearNotice();
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible
      statusBarTranslucent
      onRequestClose={clearNotice}>
      <View style={styles.backdrop}>
        <Pressable onPress={clearNotice} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <View style={styles.grabber} />
          {notice.icon ? (
            <View style={styles.iconWrap}>
              <Ionicons color={colors.primaryStrong} name={notice.icon as any} size={24} />
            </View>
          ) : null}
          {notice.eyebrow ? <Pill>{notice.eyebrow}</Pill> : null}
          <View style={{ gap: 8 }}>
            <Text style={styles.title}>{notice.title}</Text>
            <Text style={styles.message}>{notice.message}</Text>
          </View>
          <View style={styles.buttonColumn}>
            {notice.actions.map((action) => (
              <ActionButton
                key={action.id}
                label={action.label}
                onPress={() => handleAction(action.id)}
                variant={action.variant ?? 'primary'}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: HarucutColors, isDark: boolean) {
  return StyleSheet.create({
    backdrop: {
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
    },
    buttonColumn: {
      gap: 10,
      marginTop: 4,
    },
    grabber: {
      alignSelf: 'center',
      backgroundColor: colors.border,
      borderRadius: 999,
      height: 5,
      marginBottom: 4,
      width: 44,
    },
    iconWrap: {
      alignItems: 'center',
      backgroundColor: colors.primarySoft,
      borderColor: isDark ? 'rgba(30, 215, 96, 0.18)' : 'rgba(30, 215, 96, 0.18)',
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    message: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 21,
    },
    sheet: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      gap: 14,
      paddingHorizontal: 20,
      paddingTop: 12,
      shadowColor: colors.shadow,
      shadowOffset: { height: -6, width: 0 },
      shadowOpacity: isDark ? 0.34 : 1,
      shadowRadius: 30,
    },
    title: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
      lineHeight: 28,
    },
  });
}
