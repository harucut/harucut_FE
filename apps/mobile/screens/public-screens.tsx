import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { HERO_IMAGE_SOURCE, LOGIN_FIELDS, SIGNUP_FIELDS } from '@/constants/harucut-data';
import { ActionButton, AppScrollView, BrandMark, FormField, PageHeader, SurfaceCard } from '@/components/harucut/ui';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  loginWithEmail,
  reactivateAccount,
  requestPasswordResetCode,
  resetPassword,
  sendEmailAuthCode,
  signupWithEmail,
  verifyEmailAuthCode,
  verifyPasswordResetCode,
} from '@/lib/auth-api';
import { useHarucutStore } from '@/store/use-harucut-store';

type HarucutThemeColors = ReturnType<typeof useHarucutTheme>['colors'];

function usePublicScreenTheme() {
  const { colors, isDark } = useHarucutTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return { colors, isDark, styles };
}

function AuthShell({
  children,
  description,
  footer,
  title,
}: {
  children: React.ReactNode;
  description: string;
  footer?: React.ReactNode;
  title: string;
}) {
  const { styles } = usePublicScreenTheme();
  const router = useRouter();
  const push = (path: string) => router.push(path as never);

  return (
    <AppScrollView>
      <PageHeader
        description={description}
        title={title}
      />
      {children}
      {footer ? <View style={{ gap: 10 }}>{footer}</View> : null}
      <Pressable accessibilityLabel="처음 화면으로 돌아가기" accessibilityRole="button" onPress={() => push('/')}>
        <Text style={styles.authBackLink}>처음 화면으로 돌아가기</Text>
      </Pressable>
    </AppScrollView>
  );
}

function SocialButtons() {
  const { styles } = usePublicScreenTheme();

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.socialDivider}>
        <View style={styles.socialLine} />
        <Text style={styles.socialText}>또는 소셜 계정으로 계속하기</Text>
        <View style={styles.socialLine} />
      </View>
      <SocialBrandButton label="카카오 로그인" onPress={() => undefined} provider="kakao" />
      <SocialBrandButton label="네이버 로그인" onPress={() => undefined} provider="naver" />
    </View>
  );
}

function SocialBrandButton({
  label,
  onPress,
  provider,
}: {
  label: string;
  onPress: () => void;
  provider: 'kakao' | 'naver';
}) {
  const { styles } = usePublicScreenTheme();
  const isKakao = provider === 'kakao';

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButton,
        isKakao ? styles.socialKakaoButton : styles.socialNaverButton,
        pressed ? styles.socialButtonPressed : null,
      ]}>
      <View style={styles.socialButtonInner}>
        <View
          style={[
            styles.socialIconBox,
            isKakao ? styles.socialKakaoIconBox : styles.socialNaverIconBox,
          ]}>
          {isKakao ? (
            <View style={styles.kakaoMark}>
              <View style={styles.kakaoMarkBubble} />
              <View style={styles.kakaoMarkTail} />
            </View>
          ) : (
            <Text style={styles.naverMark}>N</Text>
          )}
        </View>
        <View style={styles.socialLabelWrap}>
          <Text
            style={[
              styles.socialButtonLabel,
              isKakao ? styles.socialKakaoLabel : styles.socialNaverLabel,
            ]}>
            {label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function LandingScreen() {
  const { styles } = usePublicScreenTheme();
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const showGuestTrialNotice = useHarucutStore((state) => state.showGuestTrialNotice);

  return (
    <AppScrollView contentContainerStyle={styles.landingScrollContent}>
      <View style={styles.landingHeader}>
        <BrandMark href="/" />
      </View>

      <View style={styles.landingMain}>
        <View style={styles.heroCopy}>
          <View style={styles.heroTitleStack}>
            <Text style={styles.heroTitle}>오늘의 순간을</Text>
            <Text style={styles.heroTitleGradient}>다시 보고 싶은 네 컷으로</Text>
          </View>
          <Text style={styles.heroBody}>어디에서나 촬영하고, 꾸미고, 기록을 남겨보세요.</Text>
        </View>

        <View style={styles.heroActions}>
          <ActionButton label="시작하기" onPress={() => push('/login')} style={{ flex: 1 }} />
          <ActionButton
            label="체험하기"
            onPress={showGuestTrialNotice}
            style={{ flex: 1 }}
            variant="secondary"
          />
        </View>

        <SurfaceCard style={styles.heroPreviewCard}>
          <View style={styles.heroImageFrame}>
            <Image
              accessibilityLabel="다양한 친구들이 야외에서 셀카를 찍는 네 컷 프레임 예시"
              accessibilityRole="image"
              source={HERO_IMAGE_SOURCE}
              style={styles.heroImage}
            />
          </View>
          <View style={styles.heroCardCopy}>
            <Text style={styles.heroCardTitle}>찍는 순간보다 {'\n'}다시 꺼내 볼 때 더 좋은 네 컷</Text>
            <Text style={styles.heroCardBody}>
              완성한 결과는 기록 페이지에서 다시 보고 공유할 수 있어요.
            </Text>
          </View>
        </SurfaceCard>
      </View>
    </AppScrollView>
  );
}

export function LoginScreen() {
  const { colors, styles } = usePublicScreenTheme();
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const replace = (path: string) => router.replace(path as never);
  const bootstrapMemberSession = useHarucutStore((state) => state.bootstrapMemberSession);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleLogin = async () => {
    if (!form.email.trim() || !form.password) {
      setError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const loginData = await loginWithEmail(form.email.trim(), form.password);

      if (loginData?.userStatus === 'DELETED_REQUESTED') {
        await reactivateAccount();
      }

      await bootstrapMemberSession();
      replace('/home');
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, '로그인에 실패했어요. 이메일과 비밀번호를 확인해 주세요.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      description="하루컷에 로그인하고 프레임과 기록을 이어서 관리해 보세요."
      footer={
        <>
          <SocialButtons />
          <Text style={styles.authFooter}>
            아직 계정이 없으신가요?{' '}
            <Text onPress={() => push('/signup')} style={styles.authLink}>
              회원가입
            </Text>
          </Text>
        </>
      }
      title="로그인">
      <SurfaceCard style={{ gap: 14 }}>
        {LOGIN_FIELDS.map((field) => (
          <FormField
            key={field.key}
            label={field.label}
            onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
            placeholder={field.placeholder}
            secure={field.secure}
            value={form[field.key]}
          />
        ))}

        <View style={styles.authMetaRow}>
          <Pressable onPress={() => setRemember((current) => !current)} style={styles.rememberRow}>
            <Ionicons
              color={remember ? colors.primary : colors.muted}
              name={remember ? 'checkbox' : 'square-outline'}
              size={18}
            />
            <Text style={styles.rememberText}>로그인 상태 유지</Text>
          </Pressable>

          <Text onPress={() => push('/forgot-password')} style={styles.forgotLink}>
            비밀번호 찾기
          </Text>
        </View>

        <ActionButton
          label={submitting ? '로그인 중...' : '로그인'}
          onPress={() => void handleLogin()}
        />
        {error ? <Text style={styles.formError}>{error}</Text> : null}
      </SurfaceCard>
    </AuthShell>
  );
}

export function SignupScreen() {
  const { colors, styles } = usePublicScreenTheme();
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [form, setForm] = useState({ confirmPassword: '', password: '', username: '' });
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);
  const remainingSeconds = useMemo(() => {
    if (!codeExpiresAt) return 0;
    return Math.max(Math.floor((codeExpiresAt - Date.now()) / 1000), 0);
  }, [codeExpiresAt]);

  useEffect(() => {
    if (!codeExpiresAt || verified) return;

    const timer = setInterval(() => {
      if (Date.now() >= codeExpiresAt) {
        clearInterval(timer);
        setCodeExpiresAt(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [codeExpiresAt, verified]);

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError('이메일을 입력해 주세요.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await sendEmailAuthCode(email.trim());
      setCodeExpiresAt(Date.now() + 5 * 60 * 1000);
    } catch (sendError) {
      setError(getApiErrorMessage(sendError, '인증 코드를 보내지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!email.trim() || !code.trim()) {
      setError('이메일과 인증 코드를 입력해 주세요.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await verifyEmailAuthCode(email.trim(), code.trim());
      setVerified(true);
    } catch (verifyError) {
      setError(getApiErrorMessage(verifyError, '인증 코드가 올바르지 않거나 만료되었어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async () => {
    if (!verified) {
      setError('이메일 인증을 먼저 완료해 주세요.');
      return;
    }

    if (!form.username.trim() || !form.password) {
      setError('닉네임과 비밀번호를 입력해 주세요.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('비밀번호 확인이 일치하지 않아요.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await signupWithEmail({
        email: email.trim(),
        password: form.password,
        username: form.username.trim(),
      });
      push('/login');
    } catch (signupError) {
      setError(getApiErrorMessage(signupError, '회원가입에 실패했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      description="이메일 인증 후 계정을 만들어 보세요."
      footer={
        <>
          <SocialButtons />
          <Text style={styles.authFooter}>
            이미 계정이 있으신가요?{' '}
            <Text onPress={() => push('/login')} style={styles.authLink}>
              로그인
            </Text>
          </Text>
        </>
      }
      title="회원가입">
      <SurfaceCard style={{ gap: 14 }}>
        <FormField
          label="이메일"
          onChangeText={(value) => {
            setEmail(value);
            setVerified(false);
          }}
          placeholder="example@harucut.com"
          value={email}
        />

        {verified ? (
          <View style={styles.verifiedCard}>
            <Ionicons color={colors.primary} name="shield-checkmark-outline" size={18} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.verifiedTitle}>이메일 인증이 완료되었어요.</Text>
              <Text style={styles.verifiedBody}>이메일을 수정하면 인증 코드 입력 영역이 다시 나타납니다.</Text>
            </View>
          </View>
        ) : (
          <>
            {codeExpiresAt ? (
              <View style={styles.codeNotice}>
                <Text style={styles.codeNoticeText}>
                  인증 코드가 전송되었어요. 5분 안에 입력해 주세요. {remainingSeconds > 0 ? `${remainingSeconds}s` : ''}
                </Text>
              </View>
            ) : null}
            <View style={styles.codeRow}>
              <FormField
                label="인증 코드"
                onChangeText={setCode}
                placeholder="인증 코드 입력"
                value={code}
              />
            </View>
            <View style={styles.heroActions}>
              <ActionButton
                label={codeExpiresAt ? '코드 다시 보내기' : '코드 보내기'}
                onPress={() => void handleSendCode()}
                style={{ flex: 1 }}
                variant="secondary"
              />
              <ActionButton
                label={submitting ? '확인 중...' : '인증 확인'}
                onPress={() => void handleVerifyCode()}
                style={{ flex: 1 }}
              />
            </View>
          </>
        )}

        {SIGNUP_FIELDS.map((field) => (
          <FormField
            key={field.key}
            label={field.label}
            onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
            placeholder={field.placeholder}
            secure={field.secure}
            value={form[field.key]}
          />
        ))}

        <ActionButton label={submitting ? '처리 중...' : '회원가입'} onPress={() => void handleSignup()} />
        {error ? <Text style={styles.formError}>{error}</Text> : null}
      </SurfaceCard>
    </AuthShell>
  );
}

export function ForgotPasswordScreen() {
  const { styles } = usePublicScreenTheme();
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const [step, setStep] = useState<'RESET_PASSWORD' | 'VERIFY_CODE'>('VERIFY_CODE');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestCode = async () => {
    if (!email.trim()) {
      setError('이메일을 입력해 주세요.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await requestPasswordResetCode(email.trim());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, '인증 코드를 보내지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!email.trim() || !code.trim()) {
      setError('이메일과 인증 코드를 입력해 주세요.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const token = await verifyPasswordResetCode(email.trim(), code.trim());
      setResetToken(token);
      setStep('RESET_PASSWORD');
    } catch (verifyError) {
      setError(getApiErrorMessage(verifyError, '인증 코드가 올바르지 않거나 만료되었어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetToken) {
      setError('비밀번호 재설정 인증을 먼저 완료해 주세요.');
      setStep('VERIFY_CODE');
      return;
    }

    if (!newPassword.trim() || newPassword !== confirmPassword) {
      setError('새 비밀번호와 확인 값이 일치하지 않아요.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await resetPassword(resetToken, newPassword);
      push('/login');
    } catch (resetError) {
      setError(getApiErrorMessage(resetError, '비밀번호를 변경하지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      description={step === 'VERIFY_CODE' ? '이메일로 받은 인증 코드를 입력해 주세요.' : '새 비밀번호를 입력하고 다시 로그인하세요.'}
      title="비밀번호 재설정">
      {step === 'VERIFY_CODE' ? (
        <SurfaceCard style={{ gap: 14 }}>
          <FormField label="이메일" onChangeText={setEmail} placeholder="example@harucut.com" value={email} />
          <FormField label="인증 코드" onChangeText={setCode} placeholder="인증 코드 입력" value={code} />
          <View style={styles.heroActions}>
            <ActionButton
              label={submitting ? '전송 중...' : '코드 다시 보내기'}
              onPress={() => void handleRequestCode()}
              style={{ flex: 1 }}
              variant="secondary"
            />
            <ActionButton
              label={submitting ? '확인 중...' : '인증 확인'}
              onPress={() => void handleVerifyCode()}
              style={{ flex: 1 }}
            />
          </View>
          {error ? <Text style={styles.formError}>{error}</Text> : null}
          <Text onPress={() => push('/login')} style={styles.authBackLink}>
            로그인으로 돌아가기
          </Text>
        </SurfaceCard>
      ) : (
        <SurfaceCard style={{ gap: 14 }}>
          <FormField
            label="새 비밀번호"
            onChangeText={setNewPassword}
            placeholder="새 비밀번호를 입력해 주세요"
            secure
            value={newPassword}
          />
          <FormField
            label="새 비밀번호 확인"
            onChangeText={setConfirmPassword}
            placeholder="새 비밀번호를 한 번 더 입력해 주세요"
            secure
            value={confirmPassword}
          />
          <ActionButton
            label={submitting ? '변경 중...' : '비밀번호 변경'}
            onPress={() => void handleResetPassword()}
          />
          {error ? <Text style={styles.formError}>{error}</Text> : null}
        </SurfaceCard>
      )}
    </AuthShell>
  );
}

function createStyles(colors: HarucutThemeColors, isDark: boolean) {
  return StyleSheet.create({
    authBackLink: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
    authFooter: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 18,
      textAlign: 'center',
    },
    authLink: {
      color: colors.primary,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    authMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    codeNotice: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.18)' : 'rgba(37, 99, 235, 0.08)',
      borderColor: isDark ? 'rgba(96, 165, 250, 0.34)' : 'rgba(37, 99, 235, 0.18)',
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    codeNoticeText: {
      color: colors.text,
      fontSize: 11,
      lineHeight: 17,
    },
    codeRow: {
      gap: 10,
    },
    forgotLink: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '700',
    },
    formError: {
      color: colors.danger,
      fontSize: 11,
      lineHeight: 17,
    },
    heroActions: {
      flexDirection: 'row',
      gap: 10,
    },
    heroBody: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 24,
    },
    heroCardBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    heroCardTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    heroImage: {
      height: '100%',
      width: '100%',
    },
    heroCardCopy: {
      gap: 6,
    },
    heroImageFrame: {
      alignSelf: 'center',
      aspectRatio: 0.75,
      backgroundColor: colors.backgroundTint,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      overflow: 'hidden',
      width: '86%',
    },
    heroTitle: {
      color: colors.text,
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: 0,
      lineHeight: 40.8,
    },
    heroTitleGradient: {
      color: colors.primaryStrong,
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: 0,
      lineHeight: 40.8,
    },
    heroTitleStack: {
      gap: 0,
    },
    heroCopy: {
      gap: 12,
    },
    landingHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    landingMain: {
      gap: 22,
    },
    landingScrollContent: {
      flexGrow: 1,
      gap: 28,
    },
    heroPreviewCard: {
      gap: 14,
    },
    rememberRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    rememberText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '600',
    },
    kakaoMark: {
      height: 18,
      position: 'relative',
      width: 18,
    },
    kakaoMarkBubble: {
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      borderRadius: 7,
      height: 13,
      left: 1,
      position: 'absolute',
      top: 2,
      width: 15,
    },
    kakaoMarkTail: {
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      bottom: 2,
      height: 5,
      left: 4,
      position: 'absolute',
      transform: [{ rotate: '45deg' }],
      width: 5,
    },
    naverMark: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '900',
      lineHeight: 20,
    },
    socialDivider: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    socialButton: {
      borderRadius: 12,
      overflow: 'hidden',
    },
    socialButtonInner: {
      alignItems: 'center',
      flexDirection: 'row',
      minHeight: 48,
    },
    socialButtonLabel: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: -0.1,
    },
    socialButtonPressed: {
      opacity: 0.9,
    },
    socialIconBox: {
      alignItems: 'center',
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    socialKakaoButton: {
      backgroundColor: '#FEE500',
      shadowColor: 'rgba(15, 23, 42, 0.08)',
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: 1,
      shadowRadius: 24,
    },
    socialKakaoIconBox: {
      backgroundColor: '#FEE500',
    },
    socialKakaoLabel: {
      color: 'rgba(0, 0, 0, 0.85)',
    },
    socialLine: {
      backgroundColor: colors.border,
      flex: 1,
      height: 1,
    },
    socialLabelWrap: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      paddingRight: 48,
    },
    socialNaverButton: {
      backgroundColor: '#03C75A',
      shadowColor: 'rgba(3, 199, 90, 0.22)',
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: 1,
      shadowRadius: 26,
    },
    socialNaverIconBox: {
      backgroundColor: '#02B350',
      borderRightColor: 'rgba(255, 255, 255, 0.15)',
      borderRightWidth: 1,
    },
    socialNaverLabel: {
      color: '#FFFFFF',
    },
    socialText: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '600',
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    verifiedBody: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 16,
    },
    verifiedCard: {
      alignItems: 'flex-start',
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.14)' : 'rgba(239, 246, 255, 0.96)',
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    verifiedTitle: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '700',
    },
  });
}
