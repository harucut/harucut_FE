import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { StatusBar } from 'expo-status-bar';

import { SHELL_PLATFORM, SHELL_USER_AGENT_TOKEN, getWebOrigin } from '@/constants/shell';
import {
  beginTransfer,
  ensureAndroidChannel,
  ensureNotificationPermission,
  haptic,
  pushChunk,
  saveBase64Chunks,
  saveRemoteImage,
  shareLink,
  showLocalNotification,
  transferFilename,
  type BridgeMessage,
  type BridgeResult,
} from '@/lib/native-bridge';

const WEB_ORIGIN = getWebOrigin();

/**
 * 콘텐츠가 뜨기 전에 심는 표식.
 *
 * 웹은 이 값으로 "앱 안인가"를 판단한다(apps/web/lib/nativeBridge.ts). onLoad 뒤에 심으면
 * 첫 렌더가 이미 브라우저 분기로 지나간 뒤라 늦다 — 그래서 BeforeContentLoaded 로 넣는다.
 */
const INJECT_BEFORE_LOAD = `
  window.__HARUCUT_NATIVE__ = { version: 1, platform: ${JSON.stringify(SHELL_PLATFORM)} };
  true;
`;

/** 우리 웹인가. 아니면 앱 안에서 열지 않고 바깥 브라우저로 보낸다. */
function isInternal(url: string) {
  return url.startsWith(WEB_ORIGIN);
}

export function HarucutWebShell() {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const canGoBackRef = useRef(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  /*
    상태바 글자색은 웹 테마를 따라간다.

    웹은 라이트/다크/시스템 3택이다(ColorThemePreferencePanel). 예전에는 셸이 'light' 로
    못박아 둬서, 라이트 테마를 고른 사용자는 흰 배경 위에 흰 상태바 글자를 보게 됐다 —
    시계도 배터리도 안 보인다. 웹이 자기 테마를 알려 주면 그때 맞춘다.
  */
  const [scheme, setScheme] = useState<'light' | 'dark'>('dark');

  // 채널이 없으면 안드로이드 8+ 에서 알림이 조용히 버려진다. 한 번만 만든다.
  useEffect(() => {
    void ensureAndroidChannel();
  }, []);

  const reply = useCallback((id: string, result: BridgeResult) => {
    const payload = JSON.stringify(result);
    webViewRef.current?.injectJavaScript(
      `window.__harucutNativeResolve__ && window.__harucutNativeResolve__(${JSON.stringify(id)}, ${payload}); true;`,
    );
  }, []);

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let message: BridgeMessage;
      try {
        message = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      } catch {
        return;
      }

      switch (message.type) {
        case 'haptic':
          haptic(message.style);
          return;
        case 'save-url':
          reply(message.id, await saveRemoteImage(message.url, message.filename));
          return;
        case 'save-begin':
          beginTransfer(message.id, message.filename, message.total);
          return;
        case 'save-chunk':
          pushChunk(message.id, message.index, message.data);
          return;
        case 'save-end':
          reply(message.id, await saveBase64Chunks(message.id, transferFilename(message.id)));
          return;
        case 'share':
          reply(
            message.id,
            await shareLink({ title: message.title, message: message.message, url: message.url }),
          );
          return;
        case 'notify-permission':
          reply(message.id, await ensureNotificationPermission());
          return;
        case 'notify-local':
          reply(
            message.id,
            await showLocalNotification({
              title: message.title,
              body: message.body,
              secondsFromNow: message.secondsFromNow,
            }),
          );
          return;
        case 'theme':
          // 답을 기다리지 않는다 — 화면 밝기를 맞추는 일이라 실패할 것도 없다.
          setScheme(message.scheme === 'light' ? 'light' : 'dark');
          return;
        default:
          return;
      }
    },
    [reply],
  );

  /**
   * 하드웨어 뒤로가기.
   *
   * 셸이 처리하지 않으면 어느 화면에서든 앱이 통째로 닫힌다 — 웹 히스토리가 아무리 깊어도.
   * 뒤로 갈 곳이 있으면 웹에게 넘기고, 없을 때만 기본 동작(앱 종료)에 맡긴다.
   */
  useFocusBackHandler(() => {
    if (canGoBackRef.current) {
      webViewRef.current?.goBack();
      return true;
    }
    return false;
  });

  if (loadFailed) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top }]}>
        <Text style={styles.fallbackTitle}>연결에 실패했어요</Text>
        <Text style={styles.fallbackBody}>
          네트워크 상태를 확인한 뒤 다시 시도해 주세요.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setLoadFailed(false);
            setIsLoading(true);
            webViewRef.current?.reload();
          }}
          style={styles.retryButton}>
          <Text style={styles.retryLabel}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* 웹이 알려 준 테마로 상태바 글자색을 맞춘다(위 scheme 주석 참고). */}
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <WebView
        allowsBackForwardNavigationGestures
        // 촬영 화면이 getUserMedia 를 쓴다. 이 두 값이 없으면 iOS 에서 미리보기가 전체화면으로
        // 튀거나 사용자 제스처를 기다리다 카메라가 아예 안 열린다.
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // 같은 오리진이면 카메라 권한을 매번 묻지 않는다(네이티브 권한은 이미 받은 뒤다).
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        applicationNameForUserAgent={SHELL_USER_AGENT_TOKEN}
        // 웹이 세션 쿠키로 로그인 상태를 유지한다.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        injectedJavaScriptBeforeContentLoaded={INJECT_BEFORE_LOAD}
        onMessage={onMessage}
        onLoadEnd={() => setIsLoading(false)}
        onNavigationStateChange={(state) => {
          canGoBackRef.current = state.canGoBack;
        }}
        onShouldStartLoadWithRequest={(request) => {
          // 우리 웹이면 그대로 연다.
          if (isInternal(request.url) || request.url === 'about:blank') return true;

          // 소셜 로그인은 백엔드 OAuth 로 시작해 각 제공자로 넘어간다 — 앱 안에서 이어져야
          // 돌아온 쿠키가 이 WebView 저장소에 남는다. 밖으로 내보내면 로그인이 끊긴다.
          if (/\/oauth2\/authorization\//.test(request.url)) return true;
          if (/(kakao|naver|google|accounts\.google)/i.test(request.url)) return true;

          // 나머지(약관 외부 링크·mailto·tel)는 바깥으로.
          void Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
        onError={() => setLoadFailed(true)}
        onHttpError={(event) => {
          // 404 같은 페이지 오류까지 통째로 실패 화면을 띄우면 웹의 자체 오류 화면을 가린다.
          if (event.nativeEvent.statusCode >= 500) setLoadFailed(true);
        }}
        /*
          웹 콘텐츠 프로세스가 죽었을 때.

          셸 앱에서 가장 흔한 "앱이 먹통" 신고가 여기서 나온다. 앱을 백그라운드에 두면
          OS 가 메모리를 회수하려고 WebView 의 콘텐츠 프로세스를 먼저 죽이는데, 돌아왔을 때
          아무도 되살리지 않으면 **빈 흰 화면**만 남는다. 사용자는 강제 종료 말고 할 게 없다.
          RN 은 이걸 이벤트로 알려 주므로, 받아서 다시 띄운다.
        */
        onContentProcessDidTerminate={() => {
          setIsLoading(true);
          webViewRef.current?.reload();
        }}
        onRenderProcessGone={() => {
          setIsLoading(true);
          webViewRef.current?.reload();
        }}
        /*
          target="_blank" 링크.

          안드로이드 WebView 는 `setSupportMultipleWindows` 가 기본 true 인데, 새 창을 받을
          핸들러가 없으면 **링크를 눌러도 아무 일도 일어나지 않는다.** 우리 웹의 회원가입
          화면이 약관·개인정보처리방침을 target="_blank" 로 연다 — 동의를 받는 화면에서
          정작 그 문서를 열 수 없었다. 같은 웹 안의 문서면 이 WebView 에서 그대로 연다.
        */
        onOpenWindow={(event) => {
          const url = event.nativeEvent.targetUrl;
          if (isInternal(url)) {
            webViewRef.current?.injectJavaScript(
              `window.location.href = ${JSON.stringify(url)}; true;`,
            );
            return;
          }
          void Linking.openURL(url).catch(() => undefined);
        }}
        // 셸에는 주소창이 없어 새로고침할 방법이 없었다. 아래로 당기면 다시 받는다.
        pullToRefreshEnabled
        source={{ uri: WEB_ORIGIN }}
        style={styles.webview}
      />
      {isLoading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#1ED760" size="large" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * 안드로이드 하드웨어 뒤로가기.
 *
 * 핸들러를 ref 로 들고 구독은 한 번만 건다 — 매 렌더마다 다시 구독하면 그 사이 눌린 키를
 * 놓치고, 웹 히스토리 깊이가 바뀔 때마다 리스너가 갈린다.
 */
function useFocusBackHandler(handler: () => boolean) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      handlerRef.current(),
    );
    return () => subscription.remove();
  }, []);
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#0B0B0C', flex: 1 },
  webview: { backgroundColor: '#0B0B0C', flex: 1 },
  loading: {
    alignItems: 'center',
    backgroundColor: '#0B0B0C',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: '#0B0B0C',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  fallbackTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  fallbackBody: { color: '#B3B3B3', fontSize: 14, textAlign: 'center' },
  retryButton: {
    backgroundColor: '#1ED760',
    borderRadius: 999,
    marginTop: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryLabel: { color: '#06140A', fontSize: 15, fontWeight: '800' },
});
