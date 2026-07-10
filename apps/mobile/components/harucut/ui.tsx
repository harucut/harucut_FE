import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import * as React from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { HARUCUT_RADII, HARUCUT_SPACING, type ButtonVariant, type HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';

const EXTRA_TOP_PADDING = 10;

function useUiStyles() {
  const { colors, isDark } = useHarucutTheme();

  return React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
}

export function AppScrollView({
  children,
  contentContainerStyle,
}: PropsWithChildren<{ contentContainerStyle?: StyleProp<ViewStyle> }>) {
  const styles = useUiStyles();
  // 하단 안전영역은 (app)의 BottomNavigation, (public)/(legal) 레이아웃의 bottom safe-area가
  // 처리한다. 스크롤 콘텐츠는 콘텐츠 간격만 둬서 안전영역 이중 적용(하단 여백 과다)을 막는다.
  const bottomPadding = HARUCUT_SPACING.screen;

  return (
    // 배경은 handoff처럼 단색 다크(colors.background)로 둔다. 이전의 그라데이션 + 초록 orb 2개는 제거.
    <View style={styles.screen}>
      {/*
        키보드가 입력/버튼을 가리지 않도록 감싼다. Android는 기본 windowSoftInputMode가
        adjustResize라 시스템이 이미 창을 줄이므로 behavior를 주지 않고(이중 보정 방지),
        iOS만 padding으로 밀어 올린다.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screenFill}>
        <ScrollView
          contentContainerStyle={[
            styles.screenContent,
            { paddingTop: HARUCUT_SPACING.screen + EXTRA_TOP_PADDING },
            { paddingBottom: bottomPadding },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function BrandMark({ compact = false, href = '/home' }: { compact?: boolean; href?: string }) {
  const router = useRouter();
  const styles = useUiStyles();

  return (
    <Pressable
      accessibilityLabel="하루컷 홈으로 이동"
      accessibilityRole="button"
      onPress={() => router.push(href as never)}
      style={styles.brandRow}>
      <View style={styles.brandIcon}>
        {/* 반짝이 placeholder 대신 실제 하루컷 로고(앱 아이콘)를 브랜드 마크로 사용 */}
        <Image source={require('../../assets/images/icon.png')} style={styles.brandIconImage} />
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
  title?: ReactNode;
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
  const styles = useUiStyles();

  return (
    <View style={styles.headerBlock}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 4 }}>
          {showBrand ? <BrandMark compact href="/home" /> : null}
          {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
        </View>

        {rightSlot ? (
          <Pressable
            accessibilityLabel="페이지 작업"
            accessibilityRole="button"
            onPress={onPressRight}
            style={styles.headerActionIcon}>
            {rightSlot}
          </Pressable>
        ) : backLabel && onPressBack ? (
          <Pressable accessibilityLabel={backLabel} accessibilityRole="button" onPress={onPressBack}>
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
  const styles = useUiStyles();

  return <View style={[styles.card, style]}>{children}</View>;
}

export function StepProgress({ current, label, total }: { current: number; label: string; total: number }) {
  const styles = useUiStyles();

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
  const styles = useUiStyles();

  const content = (
    <View style={[styles.pill, active ? styles.pillActive : null]}>
      <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>{children}</Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}>
      {content}
    </Pressable>
  );
}

type ActionButtonProps = {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
};

export function ActionButton({
  disabled = false,
  icon,
  label,
  onPress,
  style,
  variant = 'primary',
}: ActionButtonProps) {
  const styles = useUiStyles();

  const variantStyle =
    variant === 'danger'
      ? styles.buttonDanger
      : variant === 'ghost'
        ? styles.buttonGhost
        : variant === 'secondary'
          ? styles.buttonSecondary
          : styles.buttonPrimary;

  const labelStyle =
    variant === 'danger'
      ? styles.buttonLabelOnSolid
      : variant === 'primary'
        ? styles.buttonLabelOnPrimary
        : styles.buttonLabelDefault;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variantStyle,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
        style,
      ]}>
      <View style={styles.buttonContent}>
        {icon ? <View>{icon}</View> : null}
        <Text style={[styles.buttonLabel, labelStyle]}>{label}</Text>
      </View>
    </Pressable>
  );
}

type FormFieldProps = TextInputProps & {
  error?: string | null;
  label: string;
  secure?: boolean;
};

// React.memo로 감싸 부모(로그인/회원가입 화면)의 키 입력당 전체 리렌더가 입력 필드까지
// 전파되지 않게 한다. 부모는 필드별 onChangeText 핸들러를 안정 참조로 넘겨야 효과가 난다.
function FormFieldImpl({ error, label, secure = false, style, ...props }: FormFieldProps) {
  const [visible, setVisible] = React.useState(false);
  const { colors } = useHarucutTheme();
  const styles = useUiStyles();
  const secureTextEntry = secure && !visible;

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View>
        <TextInput
          {...props}
          accessibilityLabel={props.accessibilityLabel ?? label}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry}
          style={[styles.fieldInput, error ? styles.fieldInputError : null, style]}
        />
        {secure ? (
          <Pressable
            accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
            accessibilityRole="button"
            onPress={() => setVisible((current) => !current)}
            style={styles.passwordToggle}>
            <Ionicons
              color={colors.muted}
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

export const FormField = React.memo(FormFieldImpl);

export function SectionEyebrow({ children }: PropsWithChildren) {
  const styles = useUiStyles();

  return <Text style={styles.sectionEyebrow}>{children}</Text>;
}

function createStyles(colors: HarucutColors, isDark: boolean) {
  return StyleSheet.create({
    backLabel: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    brandCompact: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    brandEyebrow: {
      color: colors.muted,
      fontSize: 10,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    brandIcon: {
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      height: 40,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: 1,
      shadowRadius: 30,
      width: 40,
    },
    brandIconImage: {
      height: '100%',
      width: '100%',
    },
    brandIconGradient: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    brandRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
    },
    brandTitle: {
      color: colors.text,
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
    buttonDanger: {
      backgroundColor: colors.danger,
      shadowColor: colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: isDark ? 0.3 : 0.18,
      shadowRadius: 28,
    },
    buttonGhost: {
      backgroundColor: 'transparent',
      borderColor: colors.border,
      borderWidth: 1,
    },
    buttonLabel: {
      fontSize: 14,
      fontWeight: '700',
    },
    buttonLabelDefault: {
      color: colors.text,
    },
    buttonLabelOnSolid: {
      color: '#FFFFFF',
    },
    // handoff .btn-primary: 그린 채움 위 거의 검정 텍스트(Spotify식). danger는 흰색 유지.
    buttonLabelOnPrimary: {
      color: '#06140A',
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    buttonPressed: {
      opacity: 0.88,
    },
    buttonPrimary: {
      backgroundColor: colors.primary,
      shadowColor: colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: isDark ? 0.34 : 0.24,
      shadowRadius: 30,
    },
    buttonSecondary: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderWidth: 1,
    },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.card,
      borderWidth: 1,
      padding: HARUCUT_SPACING.card,
      shadowColor: colors.shadow,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: isDark ? 0.26 : 1,
      shadowRadius: 38,
    },
    fieldError: {
      color: colors.danger,
      fontSize: 11,
      lineHeight: 16,
    },
    fieldInput: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.sm,
      borderWidth: 1,
      color: colors.text,
      fontSize: 13,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingRight: 44,
    },
    fieldInputError: {
      borderColor: isDark ? 'rgba(248, 113, 113, 0.56)' : 'rgba(209, 67, 67, 0.5)',
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    headerActionIcon: {
      alignItems: 'center',
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
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
      color: colors.muted,
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
      color: colors.text,
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
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.chip,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillText: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '700',
    },
    pillTextActive: {
      color: '#FFFFFF',
    },
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    screenFill: {
      flex: 1,
    },
    screenContent: {
      gap: HARUCUT_SPACING.section,
      padding: HARUCUT_SPACING.screen,
    },
    sectionEyebrow: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primarySoft,
      borderColor: isDark ? 'rgba(30, 215, 96, 0.18)' : 'rgba(30, 215, 96, 0.12)',
      borderRadius: HARUCUT_RADII.chip,
      borderWidth: 1,
      color: colors.primaryStrong,
      fontSize: 11,
      fontWeight: '700',
      overflow: 'hidden',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    stepBar: {
      backgroundColor: isDark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.24)',
      borderRadius: HARUCUT_RADII.chip,
      flex: 1,
      height: 6,
    },
    stepBarActive: {
      backgroundColor: colors.primary,
    },
    stepCount: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '700',
    },
    stepHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    stepLabel: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '700',
    },
    stepTrack: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
  });
}
