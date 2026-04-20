import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HARUCUT_COLORS } from '@/constants/harucut-design';
import { ActionButton, Pill } from '@/components/harucut/ui';
import { useHarucutStore } from '@/store/use-harucut-store';

export function GlobalNotice() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notice = useHarucutStore((state) => state.notice);
  const clearNotice = useHarucutStore((state) => state.clearNotice);
  const enterGuestMode = useHarucutStore((state) => state.enterGuestMode);

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
        clearNotice();
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
    <Modal animationType="fade" transparent visible>
      <View style={styles.backdrop}>
        <Pressable onPress={clearNotice} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.sheet}>
            <View style={styles.iconWrap}>
              <Ionicons color={HARUCUT_COLORS.primaryStrong} name={notice.icon as any} size={24} />
            </View>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(10, 24, 45, 0.36)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  buttonColumn: {
    gap: 10,
    marginTop: 4,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.10)',
    borderColor: 'rgba(37, 99, 235, 0.18)',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  message: {
    color: HARUCUT_COLORS.muted,
    fontSize: 13,
    lineHeight: 21,
  },
  sheet: {
    backgroundColor: HARUCUT_COLORS.cardStrong,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: 30,
    borderWidth: 1,
    gap: 14,
    padding: 20,
    shadowColor: HARUCUT_COLORS.shadow,
    shadowOffset: { height: 20, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 32,
  },
  sheetWrap: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  title: {
    color: HARUCUT_COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
});
