# 앱 셸 (iOS · Android)

앱은 자기 화면을 그리지 않는다. `https://www.harucut.com` 을 WebView 로 띄우고,
**웹이 할 수 없는 일만** 네이티브가 맡는다. 경계는 두 파일이다.

| | 파일 |
|---|---|
| 앱 쪽 | `apps/mobile/components/harucut-web-shell.tsx`, `apps/mobile/lib/native-bridge.ts` |
| 웹 쪽 | `apps/web/lib/nativeBridge.ts` |

프로토콜을 바꾸면 **양쪽을 같이** 고쳐야 한다.

## 네이티브가 맡는 것과 그 이유

| 기능 | 왜 웹이 못 하나 |
|---|---|
| 사진첩 저장 | 웹 표준에 사진첩 쓰기 API 가 없다. WebView 에서는 `<a download>` 도 blob 도 안 먹는다 |
| 공유 시트 | 안드로이드 WebView 에 `navigator.share` 가 없다 |
| 햅틱 | `navigator.vibrate` 가 iOS 에서 동작하지 않는다 |
| **알림** | WebView 안에는 Notification API 가 없다. iOS WKWebView 는 미지원, 안드로이드는 권한 UI 가 없어 조용히 거절된다 |
| **상태바 색** | 웹은 상태바를 못 만진다. 웹이 자기 테마를 알려 주면 셸이 맞춘다 |
| **안전영역** | WebView 안에서는 `env(safe-area-inset-*)` 가 믿을 만하지 않다 — 안드로이드 WebView 는 edge-to-edge 로 상태바·내비바 뒤까지 그리면서 그 높이를 env 에 주지 않고, iOS 는 react-native-webview 기본값(`contentInsetAdjustmentBehavior=never`)이라 스크롤뷰가 상태바를 비키지 않는다. 셸이 `insets.top`(양쪽)·`insets.bottom`(안드로이드)을 비우고 무대색(`STAGE_COLORS`)으로 칠한다. iOS 하단 홈 인디케이터만 웹의 `env(safe-area-inset-bottom)` 이 맡는다 |
| 하드웨어 뒤로가기 | 셸이 안 잡으면 어느 화면에서든 앱이 통째로 닫힌다 |

## 셸이 WebView 를 부리는 길 — `ref`

셸이 WebView 에 지시하는 것은 전부 `webViewRef` 를 거친다. 그런데 **`<WebView>` 에 `ref` 가
붙어 있지 않았다** — 선언만 있고 element 에는 넘기지 않아 `webViewRef.current` 가 늘 `null`
이었다. `?.` 로 이어 놓은 **여섯 자리**가 통째로 무동작이었다.

| 자리 | 하는 일 | 붙기 전 |
|---|---|---|
| `reply()` | `injectJavaScript` 로 브리지 응답을 웹에 돌려준다 | **답이 한 번도 가지 않았다** |
| 하드웨어 뒤로가기 | `goBack` | 눌러도 아무 일 없음 |
| 실패 화면 `다시 시도` | `reload` | 무동작 |
| `onContentProcessDidTerminate` | `reload` | 흰 화면 그대로 |
| `onRenderProcessGone` | `reload` | 흰 화면 그대로 |
| `onOpenWindow` | `injectJavaScript` 로 같은 웹 안에서 연다 | 링크가 죽어 있었다 |

가장 무거운 것은 `reply()` 다. 웹은 답을 기다리다 타임아웃까지 묶인다 —
`save-end` 120초, `share`·`notify-permission` 120초, 나머지 60초
(`apps/web/lib/nativeBridge.ts`). 즉 앱 안의 **저장·공유·알림 버튼이 전부 실패**했다.

`ref` 를 붙이면서, 애초에 `reload()` 로는 되살아나지 않는 두 자리를 새 인스턴스로 바꿨다.

- **실패 화면의 `다시 시도`** — 실패 화면은 WebView 를 트리에서 빼고 그린다. 그 사이 ref 는
  비어 있어 `reload()` 를 부를 상대가 없다. `key` 를 바꿔 새 인스턴스를 올리고, 실패했던
  주소를 다시 연다.
- **`onRenderProcessGone`(안드로이드)** — 안드로이드는 이 콜백이 온 WebView 를 죽은 객체로
  규정한다(`WebViewClient.onRenderProcessGone` 문서: 이후 어떤 메서드도 부르지 말고 뷰
  계층에서 걷어낼 것). `reload()` 로는 살아나지 않아 새 인스턴스를 올린다.

`onContentProcessDidTerminate`(iOS·macOS)는 그대로 `reload()` 다 — 여기서는 WebView 객체가
살아 있고, URL 이 비었을 때도 라이브러리가 `source` 로 되돌아간다
(`apple/RNCWebViewImpl.m` 의 `reload`). **다만 횟수를 센다** — 아래 "되살리기를 언제 멈추나".

새 인스턴스를 올릴 때는 `canGoBack` 같은 이전 인스턴스 기준 값도 같이 비운다. 남겨 두면
기록이 빈 WebView 에 `goBack()` 을 불러 뒤로가기가 먹통이 된다.

### 지금 남은 자리와, 실패 화면에서 닿지 않는 것

지금 `webViewRef.current` 를 쓰는 자리는 **다섯**이다. 위 표에서 `reload` 두 자리가 remount 로
바뀌고, 로그인 기록 정리(`clearHistory`)가 새로 들어왔다.

| 자리 | 실패 화면에서는 |
|---|---|
| `reply()` | **닿지 않는다.** 물어본 문서가 이미 사라져 답할 곳도 없다 |
| `handleNavigation` 의 `clearHistory` | WebView 콜백이라 애초에 오지 않는다 |
| 하드웨어 뒤로가기 `goBack` | **부르지 않는다** — 아래 참고 |
| `onContentProcessDidTerminate` 의 `reload` | WebView 콜백이라 애초에 오지 않는다 |
| `onOpenWindow` 의 `injectJavaScript` | WebView 콜백이라 애초에 오지 않는다 |

즉 "`ref` 를 붙였으니 이제 모든 자리가 산다"가 아니다. **실패 화면 위에서는 ref 가 비어 있는
것이 정상이고**, 그 화면에서 사람이 실제로 누를 수 있는 둘은 ref 를 쓰지 않는 길로 간다 —
`다시 시도` 는 새 인스턴스를 올리고, 하드웨어 뒤로가기는 기본 동작(앱 종료)에 넘긴다.

뒤로가기가 특히 그랬다. 실패 직전의 `canGoBack`(참)을 그대로 믿고 `goBack()` 을 부르면,
닿는 곳은 없는데 안드로이드에는 "처리했다"고 답하는 꼴이 된다 — **눌러도 눌러도 아무 일이
없고 앱을 빠져나갈 수도 없다.** 실패 화면에서는 곧바로 `false` 를 돌려준다.

### 되살리기를 언제 멈추나

`onContentProcessDidTerminate` → `reload()` 에는 상한이 있다(`MAX_CONTENT_PROCESS_RELOADS = 2`).
되살린 문서가 뜨는 도중 또 죽으면 이 콜백이 다시 오고, 상한이 없으면 셸이 스스로 끝나지 않는
순환을 만든다 — 화면은 계속 비어 있고 앱은 살아 있어 사용자가 끊을 방법이 없다.

- 백그라운드 메모리 회수는 **한 번의 사건**이라 정상 경로는 `reload` 한 번으로 끝난다
- 두 번째는 앱으로 돌아오는 순간에도 압박이 남아 곧바로 다시 회수당하는 경우를 덮는다
- 완료된 로드 없이 세 번째로 죽으면 그건 회수가 아니라 **그 문서가 뜨는 동안 견디지 못하는
  것**이라, 더 불러도 같다 → 실패 화면으로 내려 사용자에게 넘긴다

예산은 문서가 한 번 다 뜨면(`onLoadEnd`) 되돌린다. 다 뜬 뒤에 죽는 것은 위의 정상 회수고,
**뜨는 도중에 죽는 것만** 이 상한에 쌓인다.

### 답도 우리 오리진에만 넣는다

`onMessage` 는 **들어오는** 메시지를 우리 웹으로 제한한다. `reply()` 는 **나가는** 쪽도 본다 —
공유 시트·권한 대화상자·사진첩 쓰기는 사용자 조작을 기다리므로, 답을 만드는 사이 화면이
제공자 로그인 같은 남의 문서로 넘어가 있을 수 있다. 그러면 `injectJavaScript` 는 지금 떠 있는
그 문서에서 돈다. 판정은 들어오는 쪽과 **같은 규칙**을 쓴다
(`apps/mobile/constants/shell.ts` → `packages/shared/src/shell-origin.ts`).

## 뒤로가기와 로그인 기록

웹 콜백(`/oauth2/callback`)은 `window.location.href` 로 목적지를 열어 **기록에 남는다.**
그대로 두면 뒤로가기가 콜백으로 돌아가고, 콜백은 이미 소비한 `redirectTo` 대신 또 홈으로
보낸다 — 홈과 콜백을 오가며 앱을 닫지도 못한다.

그래서 콜백을 벗어난 화면이 기록에 자리를 잡은 뒤(`loading === false`) `clearHistory()` 를
**한 번** 부른다. 로드가 시작될 때 부르면 안드로이드가 아직 콜백을 '현재 항목'으로 보고
있어서, 지우려던 콜백만 남는다.

그 이벤트가 들고 온 `canGoBack` 은 `clearHistory` 이전 값이라 아직 참이다
(`RNCWebViewClient.createWebViewEvent` 가 핸들러보다 먼저 채운다). **그 한 번만** 거짓으로
본다. 다음 이벤트부터는 네이티브 값을 그대로 쓴다 — 같은 주소로 `pushState` 해서 모달을
여는 흐름도 그 이벤트에서 뒤로가기를 되찾는다.

감수하는 것 둘.

- 로그인 이전 기록도 같이 사라진다. 콜백만 골라 건너뛸 방법이 없다.
- 콜백 다음 화면이 자리를 잡기 전에 또 옮겨 가면 지우지 않는다. 표시를 오래 들고 다니다
  엉뚱한 곳을 지우는 쪽이 더 나쁘다.

## 저장 조각을 언제 버리나

`save-begin` 뒤에 `save-end` 가 오지 않으면 조각이 앱 메모리에 남는다. 그래서 셸이
`cancelTransfers()` 로 끊는다 — 다만 **끊을 자리를 가려야 한다.**

안드로이드는 `doUpdateVisitedHistory` 에서 `onLoadStart` 를 쏜다
(`RNCWebViewClient.java`). 거기에는 `history.pushState`·`replaceState` 처럼 **문서가 그대로
살아 있는** 기록 갱신도 들어온다. 게스트 저장 도중 `로그인하고 저장`(`router.push`) 을
누르면 바로 이 경우가 되고, 무조건 끊으면 살아 있는 저장이 실패한다.

- 안드로이드: `loading` 이 참일 때만 끊는다 = 새 문서를 받아 오는 중
- iOS: `decidePolicyForNavigationAction` 에서만 이 이벤트가 나오므로 같은 문서 안 이동은
  애초에 오지 않는다 — 그대로 끊는다

`loading` 은 진행률만이 아니다. 14.0.1 은 `!mLastLoadFailed && getProgress() != 100` 으로
만든다(`RNCWebViewClient.createWebViewEvent`). 로드가 실패하면 `onReceivedError` 가
`mLastLoadFailed` 를 세우고 완료 이벤트를 **합성해** 내보내는데, 그 뒤 다음 `onPageStarted`
까지 이 값은 진행률과 무관하게 거짓이다. 즉 **실패 뒤에 오는 이벤트로는 이 문을 통과하지
못한다** — 그래서 실패 경로는 `onError` 가 직접 끊는다.

문서가 사라지는 자리는 다섯이고, 다섯이 모두 끊는다.

| 자리 | 무엇이 사라지나 |
|---|---|
| `onLoadStart`(위 조건) | 새 문서로 교체 |
| `onContentProcessDidTerminate` | 콘텐츠 프로세스 종료 (iOS·macOS) |
| `onError` · 5xx `onHttpError` | 로드 실패 — 실패 화면이 WebView 를 트리에서 뺀다 |
| `onRenderProcessGone` | 렌더 프로세스 사망 (안드로이드) |
| 실패 화면 `다시 시도` | 새 인스턴스로 교체 |

뒤의 둘은 같은 `remountWebView()` 를 거치므로 끊는 자리도 하나다.

### `onError`·`onHttpError` 는 최상위 문서만 들고 온다

정상적으로 열린 페이지에서 이미지·폰트·iframe 이 500 을 받아도 이 두 문에는 오지 않는다.
`react-native-webview` 14.0.1 소스로 확인했다.

- 안드로이드 `onHttpError` — `RNCWebViewClient.onReceivedHttpError` 가
  `request.isForMainFrame()` 일 때만 이벤트를 쏜다. 프레임워크 콜백 자체는 모든 리소스에서
  오지만 그 앞에서 걸러진다.
- 안드로이드 `onError` — 라이브러리는 **deprecated 4인자** `onReceivedError` 만 덮는다.
  AOSP `WebViewClient` 의 새 판(`WebResourceRequest`)이 `isForMainFrame()` 일 때만 그것을
  부르므로 하위 리소스는 내려오지 않는다. SSL 하위 리소스 오류는 다른 문
  (`SubResourceErrorEvent` → `onLoadSubResourceError`)으로 나가고, 셸은 그 문을 잇지 않았다.
- iOS — `decidePolicyForNavigationResponse` 가 `navigationResponse.forMainFrame` 을 보고
  (`RNCWebViewImpl.m`), `didFailProvisionalNavigation` 은 최상위 탐색에서만 온다.
  하위 프레임까지 오는 `didFailNavigation:` 은 구현돼 있지 않다.

즉 하위 리소스 하나 때문에 실패 화면으로 바뀌는 길은 없다. 가리는 것은 최상위 문서의
상태코드뿐이다(5xx 만 실패, 404 는 웹의 자체 오류 화면에 맡긴다).

## 촬영 화질 — 실측과 남은 선택지

### 지금까지 네 레이아웃 모두 확대되고 있었다

촬영본은 슬롯 비율로 가운데를 잘라 쓰고(`capturePhotoToDataUrl`), 그 조각을 슬롯 크기로
다시 늘린다(`lib/fourcutCompose.ts` `renderSourceForSlot`). 그런데 카메라에는 방향과
무관하게 늘 **가로 1920x1080** 을 요청하고 있었다. 계산하면 이렇게 된다:

| 레이아웃 | 슬롯 | 캡처(옛) | 결과 |
|---|---|---|---|
| classic-4 | 1700x1200 (2.0MP) | 1530x1080 | 1.11배 확대 |
| wide-4 | 2400x1700 (4.1MP) | 1525x1080 | 1.57배 확대 |
| grid-4 | 1700x2400 (4.1MP) | **765x1080** | **2.22배 확대** |
| polaroid-4 | 1700x2400 (4.1MP) | **765x1080** | **2.22배 확대** |

세로 슬롯이 가장 심하다 — 가로 스트림에서 세로 조각을 떼면 폭이 통째로 날아간다.

### 고친 것: 슬롯 방향에 맞춰 요청한다

`useCaptureFlow` 가 프레임의 슬롯 방향을 보고 세로 슬롯이면 세로 스트림(2160x3840)을,
가로 슬롯이면 가로(3840x2160)를 요청한다. 4K 를 주는 기기에서는 **네 경우 모두 확대가
사라진다**(1.27~1.80배 축소). 1080p 로 낮추는 기기에서도 grid/polaroid 가 2.22배 → 1.57배로 준다.

`ideal` 이라 지원하지 않는 기기에서도 실패하지 않고 가장 가까운 값으로 내려온다.

### 웹에서도 "카메라 앱처럼" 찍는 길이 있다 — `ImageCapture`

지금까지는 **영상 프레임을 캔버스로 긁었다.** 영상 스트림은 사진보다 작고 영상용 처리라
상대적으로 무르다. `ImageCapture.takePhoto()` 는 **사진 파이프라인**을 그대로 탄다.

Playwright 로 두 엔진에서 실제로 호출해 확인했다(2026-08-28):

| 엔진 | `ImageCapture` | `takePhoto()` | 쓸 수 있는 제약 |
|---|---|---|---|
| Chromium (안드로이드 계열) | 있음 | **동작** | focusMode·exposureMode·zoom·torch·iso·whiteBalance 등 **전부** |
| WebKit 26.5 (iOS Safari 계열) | 있음 | **동작** | zoom·torch·whiteBalanceMode (focusMode·exposureMode·iso 는 없음) |

> ⚠️ WebKit 은 **Playwright 빌드**에서 확인한 것이다. 실제 iOS Safari 는 기능이 늦게 열리는
> 일이 잦다. 그래서 코드는 없으면 조용히 예전 경로로 떨어진다.
> 실기기 확인은 `scripts/camera-probe.html` 을 폰에서 열면 된다(https 또는 localhost 필요).

**붙였다.** 스틸이 영상보다 이득일 때만 쓴다(`lib/canvas/stillCapture.ts`). 지원하지 않거나
`takePhoto()` 가 실패하면 그대로 영상 프레임을 긁는다 — 촬영이 실패하지는 않는다.

이득인지는 **두 번 잰다.**

| 언제 | 무엇으로 | 아니면 |
|---|---|---|
| 카메라를 켤 때 | `getPhotoCapabilities()` 의 최대 크기 | 촬영기를 아예 안 만든다 |
| 첫 장을 찍고 | 받아 온 **비트맵의 실제 크기** | 그 사진을 버리고, 남은 컷은 찍지도 않는다 |

두 번째가 왜 필요한가 — 기능 목록의 최대값은 **찍을 수 있는 한계**지 이번에 찍히는 크기가
아니다. 크기를 지정하지 않고 부르면 기기는 자기 **기본 스틸 해상도**를 준다. 그 값이
최대값보다, 심하면 지금 영상 프레임보다 작은 기기가 있다. 첫 번째만 믿으면 그런 기기에서
여덟 장 전부가 영상 프레임보다 낮은 해상도로 저장된다 — 화질을 올리려고 붙인 경로가 반대로
깎는다. 크기를 명시해 부르는 길(`takePhoto({ imageWidth, imageHeight })`)도 있지만 위 표의
실측이 **인자 없는 호출**만 확인한 것이라 쓰지 않았다. 실측 재비교는 기기가 무엇을 주든
성립한다.

화각이 어긋나는 함정이 하나 있어서 따로 다뤘다. 폰 대부분은 **사진이 4:3(센서 전체)이고
영상은 그 위아래를 잘라낸 16:9** 다. 스틸을 곧장 슬롯 비율로 자르면 사용자가 프리뷰에서 본
적 없는 위아래가 결과물에 들어온다. 그래서 **프리뷰 화각으로 먼저 맞춘 뒤** 슬롯 비율로
자른다(`lib/canvas/captureCrop.ts`, 단위 테스트 9개).

### 그래도 네이티브가 더 나은 것 — 렌즈

사진 파이프라인은 위에서 웹으로도 가져왔다. **남는 차이는 렌즈다.**

웹은 `facingMode`(전/후면)뿐이다. `enumerateDevices()` 로 카메라 목록을 볼 수는 있지만
**iOS 는 후면 렌즈를 하나만 노출하는 것으로 알려져 있다** — 초광각·망원에 접근할 방법이
없다. (이 레포는 아직 `enumerateDevices` 를 쓰지 않는다. 안드로이드에서 렌즈가 여럿
보이는지는 위 진단 페이지로 실기기에서 확인할 수 있다.)

`expo-camera@55` 에는 `getAvailableLensesAsync()` 와 `selectedLens` 가 있다(타입 확인).
초광각으로 넓게 찍는 네컷 같은 것은 네이티브로만 가능하다.

### 네이티브로 옮긴다면 (아직 안 함 — 결정 필요)

`app/_layout.tsx` 에 적힌 결정을 되돌리는 일이라 손대지 않았다. 앱이 자기 화면 19개를
그리다가 웹과 계속 어긋나서 6,299줄을 걷어낸 것이 지금 구조다. 다시 들이려면 경계를
**촬영 순간 하나로** 좁혀야 한다:

- 웹이 `nativeCapture({ width, height, count })` 를 부른다
- 셸이 네이티브 카메라를 모달로 띄우고 사진을 찍어 파일 URI 를 돌려준다
- 카운트다운·미리보기·다시찍기 같은 흐름은 **웹에 그대로 둔다**

이러면 두 벌이 되는 것은 "셔터를 누르는 화면" 하나뿐이다. 그래도 브라우저용 웹 카메라
경로는 남겨야 한다(비회원·PC 는 여전히 웹으로 찍는다). 즉 **촬영 경로가 두 개가 된다.**

## 촬영 권한은 이미 정상이다 — 확인한 결과

카메라는 웹의 `getUserMedia` 로 WebView 안에서 그대로 돈다
(`apps/web/app/shoot/capture/_hooks/useCaptureFlow.ts`). 네이티브 카메라로 바꿀 필요가 없다.
`react-native-webview` 가 **런타임 권한까지 직접 요청**하기 때문이다 —
`RNCWebChromeClient.onPermissionRequest` 가 `RESOURCE_VIDEO_CAPTURE` 를
`Manifest.permission.CAMERA` 로 옮겨 `requestPermissions` 를 부른다(소스 확인).

셸에 이미 필요한 설정이 들어 있다: `allowsInlineMediaPlayback`,
`mediaPlaybackRequiresUserAction={false}`, `mediaCapturePermissionGrantType`.

**남은 한 가지** — `app.json` 이 `android.permission.CAMERA` 를 선언하는데,
사용자가 아직 카메라를 허용하지 않은 상태에서는 `<input type="file">` 의 chooser 에서
"카메라로 찍기" 항목이 빠진다(`RNCWebViewModuleImpl.needsCameraPermission()`).
갤러리 선택은 정상이다. 촬영을 한 번 하고 나면 사라지는 증상이라 급하지 않다.

## 소셜 로그인 — 지금 구조로는 구글이 언제 막혀도 이상하지 않다

### 지금 흐름 (실측)

```
GET /oauth2/authorization/google      → 302 accounts.google.com
   (사용자 로그인)                     → 302 {baseUrl}/login/oauth2/code/google
CustomOAuth2SuccessHandler            → Set-Cookie: accessToken, refreshToken
                                      → 302 {FRONTEND_URL}/oauth2/callback
```

`CustomOAuth2SuccessHandler` 를 jar 에서 열어 확인했다 — 세션을 **쿠키로만** 넘긴다.
URL 에 토큰도, 교환용 코드도 없다.

셸은 이 흐름을 **WebView 안에 붙잡아 둔다**(`onShouldStartLoadWithRequest` 에서
`/oauth2/authorization/`·kakao·naver·google 도메인을 통과시킨다). 쿠키가 WebView 저장소에
남아야 로그인이 유지되기 때문이다.

### 문제

구글 OAuth 2.0 정책은 **임베디드 WebView 를 금지한다.** 걸리면 `disallowed_useragent` 로
로그인이 막힌다. 카카오·네이버는 현재 WebView 를 허용한다.

> 직접 테스트한 결과: 안드로이드 WebView UA(`; wv`) + `X-Requested-With: com.harucut.app`
> 로 구글 인증 URL 을 따라가 봤을 때 **오늘은 차단되지 않았다**(로그인 화면까지 200).
> 즉 지금은 동작할 수 있다. 그러나 이건 구글이 언제든 조일 수 있는 정책 위반 상태이고,
> 조여지는 순간 **앱의 구글 로그인이 통째로 죽는다.** 배포 후에 알게 되는 종류의 사고다.

### 왜 "그냥 외부 브라우저로 열면 된다"가 안 되나

외부 브라우저(Custom Tabs / `ASWebAuthenticationSession`)로 열면 구글 정책은 지켜진다.
그런데 **쿠키가 브라우저 쿠키통에 저장된다.** WebView 는 그 쿠키를 볼 수 없다.
사용자는 브라우저에서 로그인을 마치고 앱으로 돌아오는데 앱은 여전히 로그아웃 상태다.

**즉 백엔드가 도와주지 않으면 이 문제는 프론트에서 풀 수 없다.**

---

## 백엔드에 요청할 것

**정본은 [`docs/app-shell-backend-requests.md`](./app-shell-backend-requests.md) 다.**
여기 옮겨 적지 않는다 — 두 곳에 적으면 한쪽만 갱신돼 어긋난다.

세 가지가 걸려 있다.

1. **OAuth 세션을 앱으로 넘기는 일회용 코드** — 구글이 임베디드 WebView 를 금지한다.
   외부 브라우저로 열면 정책은 지켜지지만 **쿠키가 브라우저 쿠키통에 남아** 앱은
   여전히 로그아웃 상태다. 백엔드 도움 없이는 프론트에서 못 푼다.
2. **비회원·행사 참가자용 합성 경로** — 지금 합성은 전부 인증 경로 아래다.
3. **푸시 기기 토큰 등록** — 없어서 이번엔 로컬 알림만 넣었다.

### 구글 차단은 지금 재현되지 않는다 — 그래서 더 위험하다

직접 확인했다. 안드로이드 WebView UA(`; wv`) + `X-Requested-With: com.harucut.app` 로
구글 인증 URL 을 따라가 봤을 때 **오늘은 막히지 않았다** — 로그인 화면까지 200 으로 열렸고,
일반 Chrome UA 대조군과 응답 차이가 없었다.

즉 지금은 동작할 수 있다. 그러나 정책 위반 상태인 것은 그대로라, 구글이 조이는 순간
**배포된 앱의 구글 로그인이 통째로 죽는다.** 배포 후에 알게 되는 종류의 사고다.
"오늘 되니까 괜찮다"로 읽지 말 것.

## 디자인/에셋으로 필요한 것

- **안드로이드 알림 아이콘** — 흰색 실루엣 + 투명 배경 PNG.
  안드로이드는 알림 아이콘을 실루엣으로만 그린다. 지금 `icon.png`(풀컬러)를 그대로 주면
  상태바에 **흰 사각형**만 뜬다. 그래서 `app.json` 의 `expo-notifications` 플러그인에
  `icon` 을 일부러 비워 뒀다. 에셋이 나오면 넣는다.

## 이번에 고친 것

1. **WebView 프로세스가 죽으면 흰 화면으로 남던 것** — `onContentProcessDidTerminate`(iOS)·
   `onRenderProcessGone`(안드로이드)를 받아 다시 띄운다. 앱을 백그라운드에 두면 OS 가
   메모리 회수로 콘텐츠 프로세스를 먼저 죽이는데, 아무도 되살리지 않으면 사용자는
   강제 종료 말고 할 게 없었다. 셸 앱에서 가장 흔한 "먹통" 신고가 이 자리다.
   되살리는 방법은 플랫폼마다 다르다 — 위 "셸이 WebView 를 부리는 길" 참고.
2. **`target="_blank"` 링크가 안드로이드에서 아무 반응이 없던 것** — `setSupportMultipleWindows`
   기본값이 `true` 인데 `onOpenWindow` 핸들러가 없으면 링크가 그냥 무시된다.
   회원가입 화면이 약관·개인정보처리방침을 이 방식으로 연다 — **동의를 받는 화면에서
   정작 그 문서를 열 수 없었다.**
3. **라이트 테마에서 상태바 글자가 안 보이던 것** — 셸이 `style="light"` 로 못박고 있었다.
   웹이 테마를 알려 주고(`nativeSetColorScheme`) 셸이 맞춘다.
4. **새로고침할 방법이 없던 것** — `pullToRefreshEnabled`.
5. **알림** — 권한 요청(마이페이지 → 설정)과 합성 완료 로컬 알림.
