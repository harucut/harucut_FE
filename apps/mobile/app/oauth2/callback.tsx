import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { getApiErrorMessage } from '@/lib/api-client';
import { completeSocialLoginSession } from '@/lib/social-login';
import { useHarucutStore } from '@/store/use-harucut-store';

// 소셜 로그인 후 harucut://oauth2/callback 딥링크로 복귀할 때의 진입점.
// 인앱 브라우저(openAuthSessionAsync)가 결과를 돌려주지 못하는 경우
// (외부 브라우저 복귀, 콜드 스타트 등)에도 이 라우트가 세션을 확정한다.
export default function OAuthCallbackScreen() {
  const router = useRouter();
  const { colors } = useHarucutTheme();
  const showNotice = useHarucutStore((state) => state.showNotice);
  const isHandlingRef = useRef(false);

  useEffect(() => {
    if (isHandlingRef.current) {
      return;
    }
    isHandlingRef.current = true;

    let cancelled = false;

    const finishLogin = async () => {
      try {
        await completeSocialLoginSession();

        if (!cancelled) {
          router.replace('/home' as never);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        showNotice({
          actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
          eyebrow: 'SOCIAL LOGIN',
          icon: 'warning-outline',
          message: getApiErrorMessage(
            error,
            '소셜 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
          ),
          title: '소셜 로그인 실패',
        });
        router.replace('/login' as never);
      }
    };

    void finishLogin();

    return () => {
      cancelled = true;
    };
  }, [router, showNotice]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[styles.title, { color: colors.text }]}>로그인 처리 중</Text>
      <Text style={[styles.description, { color: colors.textSoft }]}>
        소셜 로그인 상태를 확인하는 중이에요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  description: {
    fontSize: 13,
    textAlign: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
});
