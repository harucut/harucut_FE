import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import * as React from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { HARUCUT_COLORS, HARUCUT_RADII, HARUCUT_SPACING, type ButtonVariant } from '@/constants/harucut-design';

export function AppScrollView({
  children,
  contentContainerStyle,
}: PropsWithChildren<{ contentContainerStyle?: StyleProp<ViewStyle> }>) {
  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.backgroundOrbTop} />
      <View pointerEvents="none" style={styles.backgroundOrbRight} />
      <ScrollView
        contentContainerStyle={[styles.screenContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

export function BrandMark({ compact = false, href = '/home' }: { compact?: boolean; href?: string }) {
  const router = useRouter();

  return (
    <Pressable onPress={() => router.push(href as never)} style={styles.brandRow}>
      <View style={styles.brandIcon}>
        <Ionicons color={HARUCUT_COLORS.primary} name="sparkles-outline" size={18} />
      </View>
      <View style={{ flexShrink: 1 }}>
        {!compact ? (
          <>
            <Text style={styles.brandEyebrow}>Record your four cuts</Text>
            <Text style={styles.brandTitle}>하루컷</Text>
          </>
        ) : (
          <Text style={styles.brandCompact}>하루컷</Text>
        )}
      </View>
    </Pressable>
  );
}

type PageHeaderProps = {
  backLabel?: string;
  description?: ReactNode;
  onPressBack?: () => void;
  onPressRight?: () => void;
  rightSlot?: ReactNode;
  showBrand?: boolean;
  title: ReactNode;
};

export function PageHeader({
  backLabel,
  description,
  onPressBack,
  onPressRight,
  rightSlot,
  showBrand = true,
  title,
}: PageHeaderProps) {
  return (
    <View style={styles.headerBlock}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 4 }}>
          {showBrand ? <BrandMark compact href="/home" /> : null}
          <Text style={styles.headerTitle}>{title}</Text>
        </View>

        {rightSlot ? (
          <Pressable onPress={onPressRight} style={styles.headerActionIcon}>
            {rightSlot}
          </Pressable>
        ) : backLabel && onPressBack ? (
          <Pressable onPress={onPressBack}>
            <Text style={styles.backLabel}>{backLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      {description ? <Text style={styles.headerDescription}>{description}</Text> : null}
    </View>
  );
}

export function SurfaceCard({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StepProgress({ current, label, total }: { current: number; label: string; total: number }) {
  return (
    <SurfaceCard style={{ paddingVertical: 14 }}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepLabel}>{label}</Text>
        <Text style={styles.stepCount}>
          {current}/{total}
        </Text>
      </View>
      <View style={styles.stepTrack}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={`${label}-${index}`}
            style={[styles.stepBar, index < current ? styles.stepBarActive : null]}
          />
        ))}
      </View>
    </SurfaceCard>
  );
}

export function Pill({
  active = false,
  children,
  onPress,
}: PropsWithChildren<{ active?: boolean; onPress?: () => void }>) {
  const content = (
    <View style={[styles.pill, active ? styles.pillActive : null]}>
      <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>{children}</Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return <Pressable onPress={onPress}>{content}</Pressable>;
}

type ActionButtonProps = {
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
};

export function ActionButton({
  icon,
  label,
  onPress,
  style,
  variant = 'primary',
}: ActionButtonProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, buttonStyles[variant], pressed ? styles.buttonPressed : null, style]}>
      <View style={styles.buttonContent}>
        {icon ? <View>{icon}</View> : null}
        <Text style={[styles.buttonLabel, buttonLabelStyles[variant]]}>{label}</Text>
      </View>
    </Pressable>
  );
}

type FormFieldProps = TextInputProps & {
  error?: string | null;
  label: string;
  secure?: boolean;
};

export function FormField({ error, label, secure = false, style, ...props }: FormFieldProps) {
  const [visible, setVisible] = React.useState(false);
  const secureTextEntry = secure && !visible;

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={HARUCUT_COLORS.muted}
          secureTextEntry={secureTextEntry}
          style={[styles.fieldInput, error ? styles.fieldInputError : null, style]}
          {...props}
        />
        {secure ? (
          <Pressable onPress={() => setVisible((current) => !current)} style={styles.passwordToggle}>
            <Ionicons
              color={HARUCUT_COLORS.muted}
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={18}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function SectionEyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.sectionEyebrow}>{children}</Text>;
}

const buttonStyles = StyleSheet.create({
  danger: {
    backgroundColor: HARUCUT_COLORS.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: HARUCUT_COLORS.border,
    borderWidth: 1,
  },
  primary: {
    backgroundColor: HARUCUT_COLORS.primary,
  },
  secondary: {
    backgroundColor: HARUCUT_COLORS.cardStrong,
    borderColor: HARUCUT_COLORS.border,
    borderWidth: 1,
  },
});

const buttonLabelStyles = StyleSheet.create({
  danger: { color: '#FFFFFF' },
  ghost: { color: HARUCUT_COLORS.text },
  primary: { color: '#FFFFFF' },
  secondary: { color: HARUCUT_COLORS.text },
});

const styles = StyleSheet.create({
  backLabel: {
    color: HARUCUT_COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  backgroundOrbRight: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: 220,
    height: 220,
    position: 'absolute',
    right: -70,
    top: 80,
    width: 220,
  },
  backgroundOrbTop: {
    backgroundColor: 'rgba(116, 169, 255, 0.16)',
    borderRadius: 260,
    height: 260,
    left: -90,
    position: 'absolute',
    top: -70,
    width: 260,
  },
  brandCompact: {
    color: HARUCUT_COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  brandEyebrow: {
    color: HARUCUT_COLORS.muted,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  brandIcon: {
    alignItems: 'center',
    backgroundColor: HARUCUT_COLORS.cardStrong,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    shadowColor: HARUCUT_COLORS.shadow,
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 30,
    width: 40,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  brandTitle: {
    color: HARUCUT_COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  button: {
    alignItems: 'center',
    borderRadius: HARUCUT_RADII.chip,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  buttonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  card: {
    backgroundColor: HARUCUT_COLORS.card,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: HARUCUT_RADII.card,
    borderWidth: 1,
    padding: HARUCUT_SPACING.card,
    shadowColor: HARUCUT_COLORS.shadow,
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 38,
  },
  fieldError: {
    color: HARUCUT_COLORS.danger,
    fontSize: 11,
    lineHeight: 16,
  },
  fieldInput: {
    backgroundColor: HARUCUT_COLORS.cardStrong,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: HARUCUT_RADII.sm,
    borderWidth: 1,
    color: HARUCUT_COLORS.text,
    fontSize: 13,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingRight: 44,
  },
  fieldInputError: {
    borderColor: 'rgba(209, 67, 67, 0.5)',
  },
  fieldLabel: {
    color: HARUCUT_COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  headerActionIcon: {
    alignItems: 'center',
    backgroundColor: HARUCUT_COLORS.cardStrong,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: HARUCUT_RADII.chip,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerBlock: {
    gap: 8,
  },
  headerDescription: {
    color: HARUCUT_COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: HARUCUT_COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  passwordToggle: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 44,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: HARUCUT_COLORS.cardStrong,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: HARUCUT_RADII.chip,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillActive: {
    backgroundColor: HARUCUT_COLORS.primary,
    borderColor: HARUCUT_COLORS.primary,
  },
  pillText: {
    color: HARUCUT_COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  screen: {
    backgroundColor: HARUCUT_COLORS.background,
    flex: 1,
  },
  screenContent: {
    gap: HARUCUT_SPACING.section,
    padding: HARUCUT_SPACING.screen,
    paddingBottom: 28,
  },
  sectionEyebrow: {
    alignSelf: 'flex-start',
    color: HARUCUT_COLORS.primaryStrong,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: HARUCUT_RADII.chip,
    overflow: 'hidden',
  },
  stepBar: {
    backgroundColor: 'rgba(148, 163, 184, 0.24)',
    borderRadius: HARUCUT_RADII.chip,
    flex: 1,
    height: 6,
  },
  stepBarActive: {
    backgroundColor: HARUCUT_COLORS.primary,
  },
  stepCount: {
    color: HARUCUT_COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  stepHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepLabel: {
    color: HARUCUT_COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  stepTrack: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
});
