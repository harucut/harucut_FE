import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { HERO_IMAGE_URL, LOGIN_FIELDS, SERVICE_TAGS, SIGNUP_FIELDS } from '@/constants/harucut-data';
import { HARUCUT_COLORS } from '@/constants/harucut-design';
import { ActionButton, AppScrollView, BrandMark, FormField, PageHeader, Pill, SectionEyebrow, SurfaceCard } from '@/components/harucut/ui';
import { useHarucutStore } from '@/store/use-harucut-store';

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
      <Pressable onPress={() => push('/')}>
        <Text style={styles.authBackLink}>처음 화면으로 돌아가기</Text>
      </Pressable>
    </AppScrollView>
  );
}

function SocialButtons() {
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
  const isKakao = provider === 'kakao';

  return (
    <Pressable
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
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const showGuestTrialNotice = useHarucutStore((state) => state.showGuestTrialNotice);

  return (
    <AppScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}>
      <View style={styles.landingHeader}>
        <BrandMark href="/" />
        <View style={styles.headerActions}>
          <ActionButton label="로그인" onPress={() => push('/login')} variant="secondary" />
          <ActionButton label="회원가입" onPress={() => push('/signup')} />
        </View>
      </View>

      <View style={{ gap: 24 }}>
        <SectionEyebrow>오늘 하루를 네 컷으로 남겨보세요</SectionEyebrow>
        <View style={{ gap: 14 }}>
          <Text style={styles.heroTitle}>오늘의 순간을</Text>
          <Text style={styles.heroTitleGradient}>다시 보고 싶은 네 컷으로</Text>
          <Text style={styles.heroBody}>
            촬영하고, 고르고, 저장하세요. 오늘 하루 기록을 가볍게 남길 수 있어요.
          </Text>
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

        <View style={styles.tagRow}>
          {SERVICE_TAGS.map((tag) => (
            <Pill key={tag}>{tag}</Pill>
          ))}
        </View>

        <SurfaceCard>
          <View style={styles.heroImageFrame}>
            <Image source={{ uri: HERO_IMAGE_URL }} style={styles.heroImage} />
          </View>
          <View style={{ gap: 8, marginTop: 16 }}>
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
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const replace = (path: string) => router.replace(path as never);
  const enterMemberMode = useHarucutStore((state) => state.enterMemberMode);
  const [form, setForm] = useState({ email: '', password: '' });
  const [remember, setRemember] = useState(true);

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
              color={remember ? HARUCUT_COLORS.primary : HARUCUT_COLORS.muted}
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
          label="로그인"
          onPress={() => {
            enterMemberMode();
            replace('/home');
          }}
        />
      </SurfaceCard>
    </AuthShell>
  );
}

export function SignupScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [form, setForm] = useState({ confirmPassword: '', password: '', username: '' });
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
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
            <Ionicons color={HARUCUT_COLORS.primary} name="shield-checkmark-outline" size={18} />
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
                onPress={() => setCodeExpiresAt(Date.now() + 5 * 60 * 1000)}
                style={{ flex: 1 }}
                variant="secondary"
              />
              <ActionButton
                label="인증 확인"
                onPress={() => setVerified(code.trim().length >= 4)}
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

        <ActionButton label="회원가입" onPress={() => push('/login')} />
      </SurfaceCard>
    </AuthShell>
  );
}

export function ForgotPasswordScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const [step, setStep] = useState<'RESET_PASSWORD' | 'VERIFY_CODE'>('VERIFY_CODE');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  return (
    <AuthShell
      description={step === 'VERIFY_CODE' ? '이메일로 받은 인증 코드를 입력해 주세요.' : '새 비밀번호를 입력하고 다시 로그인하세요.'}
      title="비밀번호 재설정">
      {step === 'VERIFY_CODE' ? (
        <SurfaceCard style={{ gap: 14 }}>
          <FormField label="이메일" onChangeText={setEmail} placeholder="example@harucut.com" value={email} />
          <FormField label="인증 코드" onChangeText={setCode} placeholder="인증 코드 입력" value={code} />
          <View style={styles.heroActions}>
            <ActionButton label="코드 다시 보내기" onPress={() => undefined} style={{ flex: 1 }} variant="secondary" />
            <ActionButton
              label="인증 확인"
              onPress={() => {
                if (code.trim().length >= 4) {
                  setStep('RESET_PASSWORD');
                }
              }}
              style={{ flex: 1 }}
            />
          </View>
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
            label="비밀번호 변경"
            onPress={() => {
              if (newPassword.trim() && newPassword === confirmPassword) {
                push('/login');
              }
            }}
          />
        </SurfaceCard>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  authBackLink: {
    color: HARUCUT_COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  authFooter: {
    color: HARUCUT_COLORS.muted,
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
  },
  authLink: {
    color: HARUCUT_COLORS.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  authMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  codeNotice: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.18)',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  codeNoticeText: {
    color: HARUCUT_COLORS.text,
    fontSize: 11,
    lineHeight: 17,
  },
  codeRow: {
    gap: 10,
  },
  forgotLink: {
    color: HARUCUT_COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
  },
  heroBody: {
    color: HARUCUT_COLORS.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  heroCardBody: {
    color: HARUCUT_COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  heroCardTitle: {
    color: HARUCUT_COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  heroImageFrame: {
    aspectRatio: 0.75,
    backgroundColor: HARUCUT_COLORS.backgroundTint,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroTitle: {
    color: HARUCUT_COLORS.text,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  heroTitleGradient: {
    color: HARUCUT_COLORS.primaryStrong,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  landingHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rememberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  rememberText: {
    color: HARUCUT_COLORS.muted,
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
    backgroundColor: HARUCUT_COLORS.border,
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
    color: HARUCUT_COLORS.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  verifiedBody: {
    color: HARUCUT_COLORS.muted,
    fontSize: 10,
    lineHeight: 16,
  },
  verifiedCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 246, 255, 0.96)',
    borderColor: HARUCUT_COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  verifiedTitle: {
    color: HARUCUT_COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
});
