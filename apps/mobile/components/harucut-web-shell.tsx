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

import {
  SHELL_PLATFORM,
  SHELL_USER_AGENT_TOKEN,
  getWebOrigin,
  isOAuthFlowUrl,
  isWebOrigin,
} from '@/constants/shell';
import {
  beginTransfer,
  cancelTransfers,
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

/** 웹의 소셜 로그인 콜백 경로. 공개 라우트 목록(AGENTS.md)과 같은 값이다. */
const WEB_OAUTH_CALLBACK_PATH = '/oauth2/callback';

/**
 * 콘텐츠 프로세스가 죽었을 때 스스로 다시 띄우는 횟수 상한 (iOS·macOS).
 *
 * 되살린 문서가 뜨자마자 또 죽으면 종료 → reload → 종료 가 끝없이 돈다. 셸이 스스로 만드는
 * 순환이라 사용자가 끊을 방법이 없다 — 화면은 계속 비어 있고 앱은 살아 있다.
 *
 * 2 로 잡는다. 백그라운드 메모리 회수는 **한 번의 사건**이라 정상 경로는 reload 한 번으로
 * 끝난다. 두 번째는 앱으로 돌아오는 순간에도 메모리 압박이 남아 곧바로 다시 회수당하는
 * 경우를 덮는다. 완료된 로드 없이 세 번째로 죽는다면 그건 회수가 아니라 **그 문서가 뜨는
 * 동안 견디지 못한다**는 뜻이라, 몇 번을 더 불러도 같다 — 실패 화면으로 내려 사용자에게
 * 넘긴다.
 *
 * 예산은 문서가 한 번 다 뜨면(onLoadEnd) 되돌린다. 다 뜬 뒤에 죽는 것은 위의 정상 회수고,
 * 뜨는 도중에 죽는 것만 이 상한에 쌓인다.
 */
const MAX_CONTENT_PROCESS_RELOADS = 2;

function pathnameOf(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/** 소셜 로그인을 마치고 돌아오는 우리 웹의 콜백 화면인가. */
function isOAuthCallbackUrl(url: string) {
  return isWebOrigin(url) && pathnameOf(url).startsWith(WEB_OAUTH_CALLBACK_PATH);
}

/**
 * 소셜 로그인이 지나가는 화면인가.
 *
 * 백엔드 인가·콜백 경로와 제공자 도메인 판정은 `@harucut/shared` 의 규칙을 그대로 쓴다
 * (constants/shell.ts isOAuthFlowUrl). 거기에 우리 웹 콜백만 더한다 — 그 화면은 우리
 * 오리진이라 "앱 밖으로 내보낼지"를 보는 isOAuthFlowUrl 의 관심사가 아니지만, **기록**
 * 으로서는 똑같이 스쳐 가는 화면이다.
 */
function isOAuthHistoryUrl(url: string) {
  return isOAuthFlowUrl(url) || isOAuthCallbackUrl(url);
}

/**
 * WebView 인스턴스 타입.
 *
 * 패키지 타입은 `class WebView<P = undefined> extends Component<WebViewProps & P>` 다
 * (react-native-webview/index.d.ts). 기본값을 그대로 두면 props 가 `WebViewProps & undefined`
 * = `never` 가 돼, ref 를 붙이는 순간 어떤 prop 도 통과하지 못한다. 타입 인자를 채워 둔다.
 */
type WebViewHandle = WebView<object>;

export function HarucutWebShell() {
  const webViewRef = useRef<WebViewHandle>(null);
  const insets = useSafeAreaInsets();
  const canGoBackRef = useRef(false);
  const currentUrlRef = useRef<string | null>(null);
  /** 소셜 로그인 콜백을 벗어난 첫 화면에서 기록을 한 번 지운다(handleNavigation 주석 참고). */
  const historyResetPendingRef = useRef(false);
  /** 완료된 로드 없이 콘텐츠 프로세스가 거듭 죽을 때 쓴 재시도 수(MAX_CONTENT_PROCESS_RELOADS). */
  const contentProcessReloadsRef = useRef(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  /*
    WebView 를 통째로 다시 올려야 하는 자리를 위한 값.

    `key` 가 바뀌면 React 가 옛 인스턴스를 걷어내고 새로 올린다. 죽은 WebView 를 되살릴 수
    없는 경우(onRenderProcessGone)와 실패 화면에서 돌아오는 경우에 쓴다. `uri` 는 그때
    다시 열 주소다 — 처음 올릴 때는 웹 첫 화면이다.
  */
  const [webViewSession, setWebViewSession] = useState({ key: 0, uri: WEB_ORIGIN });
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

  const reply = useCallback((askerUrl: string, id: string, result: BridgeResult) => {
    /*
      **물어본 문서**의 오리진으로 판정한다 — 지금 떠 있는 문서가 아니라.

      한동안 `currentUrlRef`(셸이 따라가는 주소)를 봤는데, iOS 는 이동이 커밋되기 전
      `decidePolicyForNavigationAction` 에서 이미 새 주소를 올려 보낸다. 그래서 화면에는 아직
      우리 문서가 떠 있는데 ref 만 남의 주소로 앞서 나가는 창이 생기고, 그 사이 도착한 답이
      통째로 버려졌다 — 사진은 사진첩에 들어갔는데 웹은 120초 뒤 "저장 실패"를 띄운다.

      물어본 주소로 보면 그 창이 없다. 들어오는 문(onMessage)과 같은 값을 쓰므로 판정 근거도
      하나다. 진짜로 남의 문서로 넘어간 뒤라면 그 문서에는 `__harucutNativeResolve__` 가 없어
      아래 주입이 그대로 무동작이고, 물어본 문서의 약속도 이미 사라진 뒤다.
    */
    if (!isWebOrigin(askerUrl)) return;

    const payload = JSON.stringify(result);
    webViewRef.current?.injectJavaScript(
      `window.__harucutNativeResolve__ && window.__harucutNativeResolve__(${JSON.stringify(id)}, ${payload}); true;`,
    );
  }, []);

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      /*
        누가 보낸 메시지인가.

        WebView 안에서 열린 문서는 무엇이든 `window.ReactNativeWebView.postMessage` 를
        쓸 수 있다. 오리진을 보지 않으면 소셜 로그인 중에 거쳐 가는 제공자 페이지나,
        판정을 뚫고 들어온 외부 문서가 사진 저장·알림 권한·공유를 그대로 부를 수 있다.
        브리지는 우리 웹에만 연다.
      */
      const askerUrl = event.nativeEvent.url;
      if (!isWebOrigin(askerUrl)) return;

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
          reply(askerUrl, message.id, await saveRemoteImage(message.url, message.filename));
          return;
        case 'save-begin':
          beginTransfer(message.id, message.filename, message.total);
          return;
        case 'save-chunk':
          pushChunk(message.id, message.index, message.data);
          return;
        case 'save-end':
          reply(askerUrl, message.id, await saveBase64Chunks(message.id, transferFilename(message.id)));
          return;
        case 'share':
          reply(
            askerUrl,
            message.id,
            await shareLink({ title: message.title, message: message.message, url: message.url }),
          );
          return;
        case 'notify-permission':
          reply(askerUrl, message.id, await ensureNotificationPermission());
          return;
        case 'notify-local':
          reply(
            askerUrl,
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
   * 죽은 WebView 를 걷어내고 새로 올린다.
   *
   * `key` 를 바꾸면 React 가 인스턴스를 통째로 갈아 끼운다. 새 인스턴스는 기록이 비어 있으니
   * 이전 인스턴스를 보고 쌓아 둔 값도 같이 비운다 — 남겨 두면 갈 곳 없는 goBack 을 불러
   * 뒤로가기가 먹통이 된다.
   *
   * 다시 열 주소는 마지막으로 보던 우리 웹 화면이다. 제공자 로그인 화면처럼 우리 웹 밖이면
   * 그 주소는 대개 한 번 쓰고 마는 것이라 첫 화면부터 다시 연다.
   */
  const remountWebView = useCallback(() => {
    const lastUrl = currentUrlRef.current;

    // 옛 인스턴스와 함께 그 문서도 사라진다 — 보내던 조각은 이어 붙일 수도, 답을 돌려줄
    // 수도 없다. 문서가 사라지는 다른 자리와 똑같이 끊는다(native-bridge.ts cancelTransfers).
    cancelTransfers();

    currentUrlRef.current = null;
    historyResetPendingRef.current = false;
    canGoBackRef.current = false;
    contentProcessReloadsRef.current = 0;

    setWebViewSession((session) => ({
      key: session.key + 1,
      uri: lastUrl && isWebOrigin(lastUrl) ? lastUrl : WEB_ORIGIN,
    }));
  }, []);

  /**
   * 실패 화면으로 내린다.
   *
   * 이 화면은 WebView 를 트리에서 빼고 그린다 — 조각을 보내던 문서도 그때 함께 사라지므로
   * 여기서도 끊는다. 실패로 가는 길이 여럿(onError·5xx·되살리기 포기)이라 한 자리로 모은다.
   */
  const showFailureScreen = useCallback(() => {
    cancelTransfers();
    setLoadFailed(true);
  }, []);

  /**
   * 소셜 로그인이 남긴 기록을 정리한다.
   *
   * 웹 콜백(`/oauth2/callback`)은 `window.location.href` 로 홈을 열기 때문에 콜백이 기록에
   * 그대로 남는다. 그 상태로 뒤로가기를 누르면 콜백이 다시 뜨고, 콜백은 이미 써 버린
   * `redirectTo` 대신 또 홈으로 보낸다 — 홈과 콜백을 오가며 앱을 닫지도, 이전 앱 화면으로
   * 나가지도 못한다. 그래서 콜백을 벗어난 화면에서 기록을 **한 번** 지운다.
   *
   * 지우는 시점은 그 화면이 기록에 자리를 잡은 뒤(loading === false)다. 로드가 시작될 때
   * 지우면 안드로이드는 아직 '현재 항목'을 콜백으로 보고 있어서, 지우려던 콜백만 남기고 그
   * 위에 새 화면이 얹힌다.
   *
   * 제공자 화면에서 로그인을 취소하고 뒤로 나온 경우는 콜백을 거치지 않으므로 건드리지 않는다.
   * 로그인 이전 기록도 같이 사라진다 — 콜백만 골라 건너뛸 방법이 없어 감수하는 것이다.
   *
   * `clearHistory` 는 안드로이드 전용이지만 이 덫도 안드로이드 하드웨어 뒤로가기에서만
   * 생긴다 — iOS 는 스와이프로 콜백에 닿아도 콜백이 홈으로 되돌려 놓고 앱이 닫히지 않는다.
   */
  const handleNavigation = useCallback((url: string, loading: boolean, canGoBack: boolean) => {
    const previousUrl = currentUrlRef.current;

    if (url !== previousUrl) {
      currentUrlRef.current = url;

      // 주소가 바뀔 때마다 다시 판단한다 — 콜백 바로 다음 화면 하나에서만 참이다.
      historyResetPendingRef.current =
        previousUrl !== null && isOAuthCallbackUrl(previousUrl) && !isOAuthHistoryUrl(url);
    }

    if (historyResetPendingRef.current && !loading) {
      historyResetPendingRef.current = false;
      webViewRef.current?.clearHistory?.();

      /*
        이 이벤트가 들고 온 canGoBack 은 clearHistory 를 부르기 **전에** 네이티브가 채운
        값이라 아직 참이다(RNCWebViewClient.createWebViewEvent). 그대로 믿고 goBack 을
        부르면 갈 곳이 없어 아무 일도 일어나지 않는다 — 뒤로가기 먹통.

        무시하는 것은 이 한 번뿐이다. 다음 이벤트부터는 네이티브 값이 지운 뒤의 기록을
        가리키므로 그대로 쓴다. 같은 주소로 pushState 해서 모달을 여는 흐름도 그 이벤트에서
        뒤로가기를 되찾는다 — 주소가 안 바뀐다고 계속 바닥으로 취급하면 모달을 닫으려던
        뒤로가기가 앱을 닫는다.
      */
      canGoBackRef.current = false;
      return;
    }

    canGoBackRef.current = canGoBack;
  }, []);

  /**
   * 하드웨어 뒤로가기.
   *
   * 셸이 처리하지 않으면 어느 화면에서든 앱이 통째로 닫힌다 — 웹 히스토리가 아무리 깊어도.
   * 뒤로 갈 곳이 있으면 웹에게 넘기고, 없을 때만 기본 동작(앱 종료)에 맡긴다.
   *
   * **실패 화면에서는 넘길 상대가 없다.** 그 화면은 WebView 를 트리에서 빼고 그리므로 ref 가
   * 비어 있는데(`다시 시도` 주석), 구독은 그대로 살아 있고 canGoBackRef 는 실패 직전 값을
   * 들고 있다. 그 값을 믿으면 goBack 은 아무 데도 닿지 않으면서 안드로이드에는 "처리했다"고
   * 답하는 꼴이 된다 — 눌러도 눌러도 아무 일이 없고 앱을 빠져나갈 수도 없다.
   * 여기서는 기본 동작에 맡긴다.
   */
  useFocusBackHandler(() => {
    if (loadFailed) return false;
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
            /*
              여기서 reload() 를 부를 상대가 없다. 실패 화면은 WebView 를 트리에서 빼고
              그리므로 그 사이 ref 는 비어 있다. 새 인스턴스를 올려 마지막 주소를 다시 연다.
            */
            setLoadFailed(false);
            setIsLoading(true);
            remountWebView();
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
        key={webViewSession.key}
        ref={webViewRef}
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
        onLoadEnd={() => {
          setIsLoading(false);
          /*
            문서가 한 번 다 떴으면 그 뒤의 사망은 새 사건이다 — 되살리기 예산을 되돌린다
            (MAX_CONTENT_PROCESS_RELOADS 주석).

            이 이벤트는 로드 **실패**에서도 온다(WebViewShared 의 onLoadingError 가 onError
            뒤에 onLoadEnd 를 부른다). 그때는 같은 순간 실패 화면으로 가고 WebView 가 트리에서
            빠지므로, 예산이 돌아와도 쓸 일이 없다.
          */
          contentProcessReloadsRef.current = 0;
        }}
        /*
          문서가 새로 뜨면(이동·새로고침) 조각을 보내던 웹은 이미 사라졌다. 끊어 두지 않으면
          저장을 다시 시도할 때마다 이미지 한 장이 통째로 앱 메모리에 쌓인다.

          다만 **이 이벤트가 곧 문서 교체는 아니다.** 안드로이드는 doUpdateVisitedHistory
          에서 이 이벤트를 쏘는데(RNCWebViewClient.java), 거기에는 history.pushState·
          replaceState 와 같은 문서 안에서의 기록 이동도 들어온다 — 문서도, 조각을 보내던
          웹의 약속도 그대로 살아 있는 순간이다. 실제로 "로그인하고 저장"(router.push) 이
          게스트 저장 도중에 이 경우를 만든다.

          그래서 안드로이드에서는 loading 으로 가른다. 새 문서를 받아 오는 중일 때만 참이다.
          iOS 는 decidePolicyForNavigationAction 에서만 이 이벤트가 나오므로(RNCWebViewImpl.m)
          같은 문서 안 이동은 애초에 오지 않는다.

          다만 loading 은 진행률만이 아니다 — 14.0.1 은
          `loading = !mLastLoadFailed && getProgress() != 100` 로 만든다
          (RNCWebViewClient.createWebViewEvent). 로드가 실패하면 onReceivedError 가
          mLastLoadFailed 를 세우고 완료 이벤트를 **합성해** 내보내는데, 그 뒤 다음
          onPageStarted 까지 이 문은 진행률과 무관하게 닫혀 있다. 즉 실패 뒤에 오는 이벤트로는
          여기서 끊지 못한다 — 그래서 실패 경로의 정리는 onError 가 직접 한다.
        */
        onLoadStart={(event) => {
          if (Platform.OS !== 'android' || event.nativeEvent.loading) cancelTransfers();
        }}
        onNavigationStateChange={(state) => {
          handleNavigation(state.url, state.loading, state.canGoBack);
        }}
        onShouldStartLoadWithRequest={(request) => {
          // 우리 웹이면 그대로 연다. 오리진을 통째로 견준다 — 접두사 비교는
          // `https://www.harucut.com.evil.example/` 를 내부로 오인한다.
          if (isWebOrigin(request.url) || request.url === 'about:blank') return true;

          // 소셜 로그인은 백엔드 OAuth 로 시작해 각 제공자로 넘어간다 — 앱 안에서 이어져야
          // 돌아온 쿠키가 이 WebView 저장소에 남는다. 밖으로 내보내면 로그인이 끊긴다.
          // 판정은 **호스트**로 한다(constants/shell.ts isOAuthFlowUrl).
          if (isOAuthFlowUrl(request.url)) return true;

          // 나머지(약관 외부 링크·mailto·tel)는 바깥으로.
          void Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
        /*
          로드 실패.

          이 두 문에는 **최상위 문서의 실패만** 온다 — 정상적으로 열린 페이지에서 이미지·
          폰트·iframe 이 500 을 받아도 여기까지 오지 않는다. 14.0.1 소스로 확인했다.

          - 안드로이드 `onHttpError` — `RNCWebViewClient.onReceivedHttpError` 가
            `request.isForMainFrame()` 일 때만 이벤트를 쏜다. 프레임워크 콜백 자체는 모든
            리소스에서 오지만 그 앞에서 걸러진다.
          - 안드로이드 `onError` — 라이브러리는 **deprecated 4인자** `onReceivedError` 만
            덮는다. AOSP `WebViewClient` 의 새 판(`WebResourceRequest`)이 `isForMainFrame()`
            일 때만 그것을 부르므로 하위 리소스는 내려오지 않는다. SSL 하위 리소스 오류는
            아예 다른 문(`SubResourceErrorEvent` → `onLoadSubResourceError`)으로 나가고,
            셸은 그 문을 잇지 않았다.
          - iOS — `decidePolicyForNavigationResponse` 가 `navigationResponse.forMainFrame`
            을 보고(RNCWebViewImpl.m), `didFailProvisionalNavigation` 은 최상위 탐색에서만
            온다. 하위 프레임까지 오는 `didFailNavigation:` 은 구현돼 있지 않다.

          그래서 여기서 가릴 것은 최상위 문서의 상태코드뿐이다.
        */
        onError={() => showFailureScreen()}
        onHttpError={(event) => {
          // 404 같은 페이지 오류까지 통째로 실패 화면을 띄우면 웹의 자체 오류 화면을 가린다.
          if (event.nativeEvent.statusCode >= 500) showFailureScreen();
        }}
        /*
          웹 콘텐츠 프로세스가 죽었을 때 (iOS·macOS).

          셸 앱에서 가장 흔한 "앱이 먹통" 신고가 여기서 나온다. 앱을 백그라운드에 두면
          OS 가 메모리를 회수하려고 WebView 의 콘텐츠 프로세스를 먼저 죽이는데, 돌아왔을 때
          아무도 되살리지 않으면 **빈 흰 화면**만 남는다. 사용자는 강제 종료 말고 할 게 없다.
          RN 은 이걸 이벤트로 알려 주므로, 받아서 다시 띄운다.

          여기서는 WebView 객체가 살아 있어 reload() 로 되살아난다. 프로세스가 죽어 URL 이
          비었을 때도 라이브러리가 source 로 되돌아간다(RNCWebViewImpl.m 의 reload).

          되살리기는 **횟수를 센다.** 다시 띄운 문서가 뜨는 도중 또 죽으면 이 콜백이 다시
          오고, 그대로 두면 셸이 스스로 끝나지 않는 순환을 만든다
          (MAX_CONTENT_PROCESS_RELOADS 주석).
        */
        onContentProcessDidTerminate={() => {
          // 어느 쪽으로 가든 문서는 사라졌다. 조각부터 끊는다 — reload 가 실패하면
          // onLoadStart 도 오지 않아, 죽은 문서가 보내던 조각만 앱 메모리에 남는다.
          cancelTransfers();

          if (contentProcessReloadsRef.current >= MAX_CONTENT_PROCESS_RELOADS) {
            // 다시 띄워 봐야 또 죽는다. 되살리기를 멈추고 사용자가 고를 수 있는 화면으로 내린다.
            setLoadFailed(true);
            return;
          }

          contentProcessReloadsRef.current += 1;
          setIsLoading(true);
          webViewRef.current?.reload();
        }}
        /*
          렌더 프로세스가 죽었을 때 (안드로이드).

          같은 사고지만 되살리는 방법이 다르다. 안드로이드는 이 콜백이 온 WebView 를 **죽은
          객체**로 규정한다 — 이후 어떤 메서드도 부르지 말고 뷰 계층에서 걷어내라고 못박는다
          (WebViewClient.onRenderProcessGone 문서). reload() 를 불러 봐야 흰 화면 그대로다.
          그래서 인스턴스를 새로 올린다.
        */
        onRenderProcessGone={() => {
          // 조각을 끊는 일은 remountWebView 가 한다 — 새 인스턴스를 올리는 자리는 전부 같다.
          setIsLoading(true);
          remountWebView();
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
          if (isWebOrigin(url)) {
            webViewRef.current?.injectJavaScript(
              `window.location.href = ${JSON.stringify(url)}; true;`,
            );
            return;
          }
          void Linking.openURL(url).catch(() => undefined);
        }}
        // 셸에는 주소창이 없어 새로고침할 방법이 없었다. 아래로 당기면 다시 받는다.
        pullToRefreshEnabled
        source={{ uri: webViewSession.uri }}
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
