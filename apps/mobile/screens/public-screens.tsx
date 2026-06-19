import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { HERO_IMAGE_SOURCE, LOGIN_FIELDS, SIGNUP_FIELDS } from '@/constants/harucut-data';
import { ActionButton, AppScrollView, BrandMark, FormField } from '@/components/harucut/ui';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { getApiConfig, getApiErrorMessage } from '@/lib/api-client';
import { validateEmail, validatePassword, validateUsername } from '@/lib/auth-validation';
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
import { completeSocialLoginSession } from '@/lib/social-login';
import { useSessionStore } from '@/store/use-session-store';

type HarucutThemeColors = ReturnType<typeof useHarucutTheme>['colors'];
type SocialProvider = 'google' | 'kakao' | 'naver';

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
  const { colors, styles } = usePublicScreenTheme();
  const router = useRouter();

  return (
    <AppScrollView>
      <View style={styles.authBackRow}>
        <Pressable
          accessibilityLabel="뒤로"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as never))}
          style={styles.authBackButton}>
          <Ionicons color={colors.text} name="chevron-back" size={24} />
        </Pressable>
      </View>
      <View style={styles.authIntro}>
        <Text style={styles.authTitle}>{title}</Text>
        {description ? <Text style={styles.authDescription}>{description}</Text> : null}
      </View>
      {children}
      {footer ? <View style={{ gap: 10 }}>{footer}</View> : null}
    </AppScrollView>
  );
}

function SocialButtons() {
  const { styles } = usePublicScreenTheme();
  const router = useRouter();
  const showNotice = useSessionStore((state) => state.showNotice);
  const [pending, setPending] = useState<SocialProvider | null>(null);

  // 웹은 `${backend}/oauth2/authorization/{provider}`로 이동 후 쿠키 세션을 받습니다.
  // 모바일은 시스템 인증 세션(expo-web-browser)으로 동일 엔드포인트를 열고,
  // `harucut://oauth2/callback` 딥링크로 복귀한 뒤 세션 상태를 확인합니다.
  // 인증 세션이 결과를 돌려주지 못하는 경로(외부 브라우저 복귀, 콜드 스타트)는
  // app/oauth2/callback.tsx 라우트가 같은 절차로 세션을 확정합니다.
  const handleSocialLogin = async (provider: SocialProvider) => {
    if (pending) {
      return;
    }

    setPending(provider);

    try {
      const { baseUrl } = getApiConfig();
      const returnUrl = Linking.createURL('oauth2/callback');
      const authUrl = `${baseUrl}/oauth2/authorization/${provider}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);

      if (result.type !== 'success') {
        return;
      }

      await completeSocialLoginSession();
      router.replace('/home' as never);
    } catch (error) {
      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'SOCIAL LOGIN',
        icon: 'warning-outline',
        message: getApiErrorMessage(error, '소셜 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'),
        title: '소셜 로그인 실패',
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.socialDivider}>
        <View style={styles.socialLine} />
        <Text style={styles.socialText}>또는 소셜 계정으로 계속하기</Text>
        <View style={styles.socialLine} />
      </View>
      <SocialBrandButton
        label={pending === 'kakao' ? '카카오 로그인 중...' : '카카오로 계속하기'}
        onPress={() => void handleSocialLogin('kakao')}
        provider="kakao"
      />
      <SocialBrandButton
        label={pending === 'naver' ? '네이버 로그인 중...' : '네이버로 계속하기'}
        onPress={() => void handleSocialLogin('naver')}
        provider="naver"
      />
      <SocialBrandButton
        label={pending === 'google' ? 'Google 로그인 중...' : 'Google로 계속하기'}
        onPress={() => void handleSocialLogin('google')}
        provider="google"
      />
      <Text style={styles.socialConsentNotice}>
        소셜 계정으로 계속하면{' '}
        <Text onPress={() => router.push('/terms' as never)} style={styles.socialConsentLink}>
          서비스 이용약관
        </Text>
        과{' '}
        <Text onPress={() => router.push('/privacy' as never)} style={styles.socialConsentLink}>
          개인정보 처리방침
        </Text>
        에 동의하는 것으로 간주됩니다.
      </Text>
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
  provider: SocialProvider;
}) {
  const { styles } = usePublicScreenTheme();

  const buttonStyle =
    provider === 'kakao'
      ? styles.socialKakaoButton
      : provider === 'naver'
        ? styles.socialNaverButton
        : styles.socialGoogleButton;

  const iconBoxStyle =
    provider === 'kakao'
      ? styles.socialKakaoIconBox
      : provider === 'naver'
        ? styles.socialNaverIconBox
        : styles.socialGoogleIconBox;

  const labelStyle =
    provider === 'kakao'
      ? styles.socialKakaoLabel
      : provider === 'naver'
        ? styles.socialNaverLabel
        : styles.socialGoogleLabel;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButton,
        buttonStyle,
        pressed ? styles.socialButtonPressed : null,
      ]}>
      <View style={styles.socialButtonInner}>
        <View style={[styles.socialIconBox, iconBoxStyle]}>
          {provider === 'kakao' ? (
            <Image
              accessibilityElementsHidden
              importantForAccessibility="no"
              resizeMode="contain"
              source={require('../assets/images/kakao-symbol.png')}
              style={styles.kakaoLogo}
            />
          ) : provider === 'naver' ? (
            <Image
              accessibilityElementsHidden
              importantForAccessibility="no"
              resizeMode="contain"
              source={require('../assets/images/naver-symbol.png')}
              style={styles.naverLogo}
            />
          ) : (
            <Image
              accessibilityElementsHidden
              importantForAccessibility="no"
              resizeMode="contain"
              source={require('../assets/images/google-g-logo.png')}
              style={styles.googleLogo}
            />
          )}
        </View>
        <View style={styles.socialLabelWrap}>
          <Text style={[styles.socialButtonLabel, labelStyle]}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function LandingScreen() {
  const { styles } = usePublicScreenTheme();
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const showGuestTrialNotice = useSessionStore((state) => state.showGuestTrialNotice);

  return (
    <View style={styles.onboardingScreen}>
      <View style={styles.onboardingHeader}>
        <BrandMark compact href="/" />
      </View>

      {/* 떠 있는 네 컷 프레임 — 겹쳐서 중앙 배치 */}
      <View pointerEvents="none" style={styles.onboardingFrames}>
        <View style={styles.onboardingFrameLeft}>
          <Image
            accessibilityRole="image"
            source={HERO_IMAGE_SOURCE}
            style={styles.onboardingFrameImage}
          />
        </View>
        <View style={styles.onboardingFrameRight}>
          <Image
            accessibilityRole="image"
            source={HERO_IMAGE_SOURCE}
            style={styles.onboardingFrameImage}
          />
        </View>
      </View>

      <View style={styles.onboardingFooter}>
        <View style={styles.onboardingTitleStack}>
          <Text style={styles.onboardingTitle}>어디서든,</Text>
          <Text style={styles.onboardingTitleAccent}>오늘의 네 컷</Text>
        </View>
        <Text style={styles.onboardingBody}>특별한 하루를{'\n'}사진으로 남겨보세요.</Text>

        <ActionButton label="시작하기" onPress={() => push('/signup')} />
        <ActionButton
          label="이미 계정이 있어요"
          onPress={() => push('/login')}
          style={{ marginTop: 10 }}
          variant="ghost"
        />
        <Pressable
          accessibilityLabel="로그인 없이 바로 촬영해보기"
          accessibilityRole="button"
          onPress={showGuestTrialNotice}
          style={{ marginTop: 16 }}>
          <Text style={styles.onboardingGuestLink}>로그인 없이 바로 촬영해보기 →</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function LoginScreen() {
  const { colors, styles } = usePublicScreenTheme();
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const replace = (path: string) => router.replace(path as never);
  const bootstrapMemberSession = useSessionStore((state) => state.bootstrapMemberSession);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remember, setRemember] = useState(true);

  // 키 입력마다 새 인라인 핸들러를 만들면 memo된 FormField가 매번 리렌더되어, 가려진
  // 비밀번호 입력의 노출→마스킹 왕복이 끊겨 보인다. 필드별 핸들러를 한 번만 만들어
  // 안정 참조로 넘겨 바뀐 필드만 리렌더되게 한다.
  const handleFieldChange = useMemo(
    () =>
      Object.fromEntries(
        LOGIN_FIELDS.map((field) => [
          field.key,
          (value: string) => setForm((current) => ({ ...current, [field.key]: value })),
        ]),
      ) as Record<string, (value: string) => void>,
    [],
  );

  const handleLogin = async () => {
    const emailError = validateEmail(form.email);
    if (emailError) {
      setError(emailError);
      return;
    }

    if (!form.password) {
      setError('비밀번호를 입력해 주세요.');
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
      description="로그인하고 오늘의 네 컷을 이어가요."
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
      title="다시 오셨네요">
      <View style={{ gap: 14 }}>
        {LOGIN_FIELDS.map((field) => (
          <FormField
            key={field.key}
            label={field.label}
            onChangeText={handleFieldChange[field.key]}
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
      </View>
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
  // 키 입력당 화면 전체 리렌더가 memo된 FormField까지 번지지 않도록 필드별 핸들러를
  // 안정 참조로 한 번만 만든다(가려진 비밀번호 입력 버벅임 방지).
  const handleFieldChange = useMemo(
    () =>
      Object.fromEntries(
        SIGNUP_FIELDS.map((field) => [
          field.key,
          (value: string) => setForm((current) => ({ ...current, [field.key]: value })),
        ]),
      ) as Record<string, (value: string) => void>,
    [],
  );
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [consents, setConsents] = useState({ privacy: false, terms: false });
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
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
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

    if (!consents.terms || !consents.privacy) {
      setError('서비스 이용약관과 개인정보 수집·이용에 동의해야 가입할 수 있어요.');
      return;
    }

    const usernameError = validateUsername(form.username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    const passwordError = validatePassword(form.password);
    if (passwordError) {
      setError(passwordError);
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
      description="금방 끝나요. 이메일 인증 후 바로 첫 네 컷을 찍으러 가요."
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
      <View style={{ gap: 14 }}>
        <FormField
          label="이메일"
          onChangeText={(value) => {
            setEmail(value);
            setVerified(false);
            setCode('');
            setCodeExpiresAt(null);
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
            onChangeText={handleFieldChange[field.key]}
            placeholder={field.placeholder}
            secure={field.secure}
            value={form[field.key]}
          />
        ))}

        <View style={{ gap: 10 }}>
          {(
            [
              { key: 'terms', label: '[필수] 서비스 이용약관 동의', path: '/terms' },
              { key: 'privacy', label: '[필수] 개인정보 수집·이용 동의', path: '/privacy' },
            ] as const
          ).map((item) => (
            <View key={item.key} style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
              <Pressable
                accessibilityLabel={item.label}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consents[item.key] }}
                onPress={() =>
                  setConsents((current) => ({ ...current, [item.key]: !current[item.key] }))
                }
                style={{ alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8 }}>
                <Ionicons
                  color={consents[item.key] ? colors.primary : colors.muted}
                  name={consents[item.key] ? 'checkbox' : 'square-outline'}
                  size={20}
                />
                <Text style={{ color: colors.textSoft, flex: 1, fontSize: 12 }}>{item.label}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`${item.label} 내용 보기`}
                accessibilityRole="button"
                onPress={() => push(item.path)}>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    textDecorationLine: 'underline',
                  }}>
                  보기
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <ActionButton label={submitting ? '처리 중...' : '회원가입'} onPress={() => void handleSignup()} />
        {error ? <Text style={styles.formError}>{error}</Text> : null}
      </View>
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
  const [codeRequested, setCodeRequested] = useState(false);

  const handleRequestCode = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await requestPasswordResetCode(email.trim());
      setCodeRequested(true);
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

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
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
        <View style={{ gap: 14 }}>
          <FormField
            editable={!codeRequested}
            label="이메일"
            onChangeText={setEmail}
            placeholder="example@harucut.com"
            value={email}
          />
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
        </View>
      ) : (
        <View style={{ gap: 14 }}>
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
        </View>
      )}
    </AuthShell>
  );
}

function createStyles(colors: HarucutThemeColors, isDark: boolean) {
  return StyleSheet.create({
    authBackRow: {
      marginBottom: 6,
    },
    authBackButton: {
      alignItems: 'center',
      height: 40,
      justifyContent: 'center',
      marginLeft: -8,
      width: 40,
    },
    authIntro: {
      gap: 6,
      marginBottom: 22,
    },
    authTitle: {
      color: colors.text,
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.6,
    },
    authDescription: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20,
    },
    authBackLink: {
      color: colors.muted,
      fontSize: 12,
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
      backgroundColor: isDark ? 'rgba(30, 215, 96, 0.18)' : 'rgba(30, 215, 96, 0.08)',
      borderColor: isDark ? 'rgba(30, 215, 96, 0.34)' : 'rgba(30, 215, 96, 0.18)',
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
    onboardingScreen: {
      backgroundColor: colors.background,
      flex: 1,
      overflow: 'hidden',
      position: 'relative',
    },
    onboardingHeader: {
      paddingHorizontal: 22,
      paddingTop: 10,
      zIndex: 2,
    },
    onboardingFrames: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'center',
      left: 0,
      position: 'absolute',
      right: 0,
      top: 74,
      zIndex: 1,
    },
    onboardingFrameImage: {
      borderRadius: 14,
      height: '100%',
      width: '100%',
    },
    onboardingFrameLeft: {
      aspectRatio: 0.62,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      height: 206,
      marginRight: -30,
      marginTop: 18,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: 0.55,
      shadowRadius: 30,
      transform: [{ rotate: '-9deg' }],
    },
    onboardingFrameRight: {
      aspectRatio: 0.62,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      height: 228,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { height: 20, width: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 34,
      transform: [{ rotate: '7deg' }],
    },
    onboardingFooter: {
      marginTop: 'auto',
      paddingBottom: 30,
      paddingHorizontal: 26,
      paddingTop: 60,
      zIndex: 2,
    },
    onboardingTitleStack: {
      gap: 0,
    },
    onboardingTitle: {
      color: colors.text,
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: -1,
      lineHeight: 35,
    },
    onboardingTitleAccent: {
      color: colors.primary,
      fontSize: 30,
      fontWeight: '500',
      letterSpacing: -1,
      lineHeight: 35,
    },
    onboardingBody: {
      color: colors.muted,
      fontSize: 14.5,
      lineHeight: 23,
      marginBottom: 26,
      marginTop: 12,
    },
    onboardingGuestLink: {
      color: colors.muted,
      fontSize: 13.5,
      fontWeight: '600',
      textAlign: 'center',
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
    kakaoLogo: {
      height: 26,
      width: 26,
    },
    naverLogo: {
      height: 30,
      width: 30,
    },
    googleLogo: {
      height: 20,
      width: 20,
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
    socialGoogleButton: {
      backgroundColor: '#FFFFFF',
      borderColor: isDark ? 'rgba(15, 23, 42, 0.16)' : 'rgba(60, 64, 67, 0.18)',
      borderWidth: 1,
      shadowColor: 'rgba(15, 23, 42, 0.08)',
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: 1,
      shadowRadius: 24,
    },
    socialGoogleIconBox: {
      backgroundColor: '#FFFFFF',
    },
    socialGoogleLabel: {
      color: 'rgba(30, 30, 30, 0.88)',
    },
    legalFooterLink: {
      color: colors.muted,
      fontSize: 11,
      textDecorationLine: 'underline',
    },
    socialConsentLink: {
      color: colors.textSoft,
      textDecorationLine: 'underline',
    },
    socialConsentNotice: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 16,
      textAlign: 'center',
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
      backgroundColor: isDark ? 'rgba(30, 215, 96, 0.14)' : 'rgba(239, 246, 255, 0.96)',
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
