# 앱 웹뷰 셸 — 백엔드에 필요한 것

앱이 자기 화면을 그리지 않고 웹을 띄우는 구조로 바뀌었다(ADR-0003). 그 결과 **백엔드 쪽에
세 가지가 필요해졌다.** 전부 프론트에서는 우회할 방법이 없다.

우선순위 순으로 적는다. 1번이 없으면 앱에서 **소셜 로그인이 불가능**하고, 2번이 없으면
비회원·행사 참가자가 서버 합성 결과물을 받지 못한다. 3번은 없어도 앱은 돌지만
서버가 사용자에게 먼저 말을 걸 수단이 없다.

4~7번은 셸과 무관하다(합성 원본 정리, 요금제 한도, 프레임 수정 시각, 셀 누끼 렌더 주체).
창구가 같아 여기 모아 둔다. **막는 것은 1~4번이고, 5~7번은 답 대기이거나 「있으면 좋음」이다.**

**백엔드에 남은 요청은 이 문서가 소유한다.** 다른 문서가 같은 목록을 복제하면 해결된 항목이
한쪽에만 지워진다 — `docs/backend-contract.md` 의 테두리색 항목이 실제로 그렇게 됐다.
각 항목이 오늘도 막혀 있는지는 맨 아래 「이번 세션에 확인한 것」 표에 적는다.

---

## 1. OAuth 세션을 앱으로 넘기는 일회용 코드 (필수)

### 왜 필요한가

웹 로그인은 백엔드 OAuth 엔드포인트로 **전체 페이지 이동**한다.

```ts
// apps/web/lib/authLogin.ts:9-11, :23
export function socialAuthorizeUrl(provider: SocialProvider) {
  return `${backendBase}/oauth2/authorization/${provider}`;
}
// startSocialLogin() 안에서
window.location.href = socialAuthorizeUrl(provider);
```

앱 안(WebView)에서 이걸 그대로 태우면 **구글이 차단한다** — 구글은 임베디드 웹뷰에서의
OAuth 를 `disallowed_useragent` 로 거부하는 정책이다. 카카오·네이버는 통과하지만 구글은 막힌다.

그래서 구글만은 앱 밖(Custom Tabs / ASWebAuthenticationSession)에서 로그인해야 하는데,
**거기서 받은 쿠키는 WebView 의 쿠키 저장소로 넘어오지 않는다.** 두 브라우저 컨텍스트가
격리돼 있기 때문이다. 결과적으로 "로그인은 됐는데 앱은 여전히 비로그인" 상태가 된다.

### 지금 백엔드

```java
// CustomOAuth2SuccessHandler
private static final String CALLBACK_PATH = "/oauth2/callback";
this.callbackUrl = frontendUrl + CALLBACK_PATH;   // 웹 URL 로만 리다이렉트
```

앱으로 돌아올 경로도, 세션을 옮길 수단도 없다.

### 요청 내용

**(a) OAuth 시작에 앱 진입임을 알리는 표시를 받아 준다.**

```
GET /oauth2/authorization/{provider}?client=app
```

`client=app` 이면 성공 핸들러가 웹 URL 대신 **앱 스킴**으로 돌려보낸다.
앱 스킴은 이미 등록돼 있다 — `harucut://` (`apps/mobile/app.json` 의 `scheme`).

**(b) 성공 시 세션 쿠키 대신 일회용 코드를 붙여 앱으로 돌려보낸다.**

```
harucut://oauth2/callback?code=<일회용 코드>
```

- 코드는 **1회용**이고 **짧게**(60초 안팎) 만료된다.
- 코드 자체는 인증 수단이 아니다 — 교환해야 세션이 된다.

**(c) 코드를 세션 쿠키로 바꾸는 엔드포인트를 연다.**

```
POST /api/harucut/oauth2/exchange
  { "code": "<일회용 코드>" }

→ 200, Set-Cookie: accessToken=...; refreshToken=...
   (지금 /api/harucut/login 이 내려주는 것과 **완전히 같은 쿠키 계약**)
```

앱은 이 요청을 **WebView 안에서** 보낸다. 그래야 Set-Cookie 가 WebView 쿠키 저장소에 남아
이후 모든 화면이 로그인 상태가 된다.

### 프론트가 할 일 (백엔드가 열리면)

1. 셸이 `/oauth2/authorization/google` 로의 이동을 가로채 `?client=app` 을 붙여 Custom Tabs 로 연다
2. `harucut://oauth2/callback?code=...` 딥링크를 받는다
3. 그 코드를 WebView 안에서 `POST /api/harucut/oauth2/exchange` 로 교환한다
4. 웹을 새로고침한다 — 쿠키가 생겼으니 로그인 상태로 뜬다

카카오·네이버는 WebView 안에서 그대로 진행되므로 이 경로가 필요 없다(지금도 동작한다).

### 확인 방법

교환 엔드포인트가 뜨면, 앱에서 구글 로그인 → 홈 화면에 내 닉네임이 보이면 성공이다.

---

## 2. 비회원·행사 참가자용 합성 경로 (중요)

### 왜 필요한가

서버 합성과 원본 업로드가 **전부 인증 경로 아래**다.

```java
@RequestMapping("/api/auth/user/media/compose")   // ComposeController
@RequestMapping("/api/auth/user/files")           // FileController (presigned-upload)

// ComposeService — 원본이 내 S3 루트 아래인지 검사
if (!sourceKey.startsWith(S3Keys.userRoot(publicId))) throw FORBIDDEN;
```

익명으로 부를 수 있는 경로는 백엔드 전체에 하나도 없다(컨트롤러 **24개** 전수 확인,
2026-09-01). 인증 없이 열려 있는 것은 `/api/email-auth/*`, `/api/harucut/{login,register,reissue,reset/*}`,
`/api/notices*`, `/api/terms`, `/api/oauth2/unlink/naver`, `/api/payments/webhook` 뿐이고
합성·업로드는 하나도 없다 — 익명으로 compose 를 부르면 `401 AUTH-010` 이다(재현).

그런데 제품은 **비회원이 찍고 결과물을 가져가는 것**을 판매 문구로 걸고 있다:

- `packages/shared/src/plans.ts` — "참가자는 가입 없이 자기 휴대폰으로 찍고 **그 자리에서 가져가요**"
- `apps/web/app/enterprise/page.tsx` — 같은 약속
- FAQ — "가입 없이도 촬영하고 결과 이미지를 바로 내려받을 수 있어요"

지금은 **브라우저가 합성하기 때문에** 이 약속이 지켜진다. 서버 합성으로 옮기는 순간 깨진다.

### 요청 내용

행사 참가자·비회원도 합성을 부를 수 있는 경로. 형태는 백엔드가 편한 쪽으로 정하면 된다.
프론트가 필요한 것은 "**계정 없이** 원본 4장을 올리고 합성 결과 URL 을 받는 것" 하나다.

예시 A — 게스트 토큰
```
POST /api/guest/session            → { guestToken }        (짧은 수명)
POST /api/guest/files/presigned-upload   (guestToken 필요)
POST /api/guest/media/compose            (guestToken 필요)
```

예시 B — 행사 코드 기반
```
POST /api/events/{eventCode}/compose   { sourceKeys[4] }
```

어느 쪽이든 **결과물이 남는 위치와 수명**을 정해야 한다(비회원 결과물은 보관함에 안 남는다는
약관 제8조와 어긋나지 않게).

---

## 3. 푸시 알림용 기기 토큰 등록 (있으면 좋음)

### 왜 필요한가

WebView 안에는 웹 Notification API 가 없다 — iOS WKWebView 는 미지원이고 안드로이드
WebView 도 권한 UI 가 없어 조용히 거절된다. 그래서 알림은 네이티브가 맡는다.

앱 쪽은 이미 붙였다(`expo-notifications`). 다만 **로컬 알림으로는 정작 필요한 경우를 못 덮는다.**

서버 합성은 최대 90초까지 걸린다(`lib/composeApi.ts`). 그 사이 사용자가 **앱을 백그라운드로
보내면 OS 가 WebView 의 자바스크립트를 멈춘다** — 폴링도, 완료 시 알림을 띄우는 코드도 돌지
않는다. 앱으로 돌아오면 그제야 폴링이 재개되는데 그때는 화면이 이미 보이는 상태라 알릴 이유가
없다. 지금 로컬 알림이 실제로 덮는 것은 **셸 안인데 문서만 hidden 이고 JS 는 아직 도는 때**
뿐이다(안드로이드 WebView 가 대표적이다). **브라우저 탭은 아니다** — 셸 밖에서는
`nativeNotify` 가 그 자리에서 `null` 을 돌려주고 아무 일도 하지 않는다
(`apps/web/lib/nativeBridge.ts` 의 `isNativeShell` 검사).

즉 "앱을 벗어난 사이에 알려 주는 것"은 **서버가 보내야만 된다.**

없는 것은 **서버가 먼저 보내는 알림**이다. `/v3/api-docs` 를 전수 확인한 결과
push·device·token 관련 경로가 **0건**이라, 기기 토큰을 받아 봐야 보낼 곳이 없다.
그래서 토큰을 꺼내는 코드는 일부러 넣지 않았다 — 쓸 수 없는 스텁을 남기지 않는다.

### 요청 내용

```
POST   /api/auth/devices     { token, platform: "ios" | "android" }   // 등록(같은 토큰 재등록은 무시)
DELETE /api/auth/devices/{token}                                       // 해제(로그아웃 시)
```

보낼 이벤트도 함께 정하면 좋다. 지금 후보는 둘이다.
- 합성 완료 (앱을 벗어난 사이에 끝났을 때)
- 구독 만료 임박 / 정기결제 실패(`PAY-002`, `SUBS-*`)

### 프론트가 할 일 (백엔드가 열리면)

`expo-notifications` 의 `getExpoPushTokenAsync({ projectId })` 결과를 브리지로 웹에 넘기고
위 엔드포인트에 올리면 된다. 브리지 자리는 이미 있다(`apps/web/lib/nativeBridge.ts`).
**실기기에서만 토큰이 발급된다** — 시뮬레이터에서 실패하는 것은 정상이다.

---

## 4. 합성 원본(FOURCUT_SOURCE) 정리 (있으면 좋음)

### 왜 필요한가

원본 4장은 **합성이 성공했을 때만** 서버가 지운다. 실패하면 그대로 남는다.

```java
@RequestMapping("/api/auth/user/files")   // FileController — presigned-upload · presigned-img 둘
```

엔드포인트는 둘이지만 **어느 쪽도 삭제가 아니다.** 그래서 아래 결론은 그대로다.

프론트에는 지울 방법이 없다. 파일을 지우는 경로가 계약에 없고(프록시의 DELETE 는
`user/media/{mediaId}`·`user/frame/{frameId}`·로그아웃·탈퇴뿐), 원본은 보관함에 등록되지
않아 mediaId 도 없다. 남는 것은 **얼굴이 담긴 슬롯 크기 JPEG 4장**(장당 최대 4MP)이다.

남는 경로는 둘이다.

- 업로드 도중 한 장이 실패 — 이미 올라간 나머지가 남는다
- 4장이 다 올라간 뒤 `POST /api/auth/user/media/compose` 또는 폴링이 실패 — 4장이 다 남는다

사용자가 재시도를 누르면 원본 4장을 처음부터 다시 올린다 — 업로드는 멱등키를 쓰지 않고
매번 새 presigned key 를 받는다. 실패 1회당 최대 4개가 쌓인다.

(합성 접수 자체는 재시도해도 같은 멱등키로 나간다. `apps/web/app/shoot/result/page.tsx` 가
`retryNonce` 를 멱등키에서 빼 뒀다 — 그래서 **결과물**은 두 벌이 되지 않지만, 그 앞단의
**원본 업로드**는 그 보호를 받지 않는다.)

### 프론트가 이미 한 것

`apps/web/lib/fourcutCompose.ts` 에서 **쓸 일 없는 원본을 덜 만드는 것**까지는 했다.

- 프레임을 먼저 확정한 뒤에 올린다(프레임 조회가 실패할 운명이면 한 장도 안 올린다)
- 4장을 다 구운 뒤에 올린다(굽기가 실패하면 한 장도 안 올린다)
- 한 장이 실패해도 나머지 업로드가 끝날 때까지 기다린다 — 올라간 key 를 잃지 않는다

여기까지다. **이미 올라간 것을 지우는 일은 프론트가 못 한다.**

### 요청 내용

둘 중 하나면 된다.

**(a) 수명 주기 규칙 (권장)**

`FOURCUT_SOURCE` 로 발급하는 원본 key 의 prefix 에 만료 규칙을 건다(정확한 prefix 는
백엔드가 정하는 값이라 여기 적지 않는다 — `S3Keys.userRoot(publicId)` 아래 합성 원본 자리).

```
<FOURCUT_SOURCE prefix>  →  24시간 뒤 만료
```

합성은 최대 90초(`apps/web/lib/composeApi.ts` 의 `timeoutMs = 90_000`)라 하루면 충분히
여유롭다. 프론트 변경이 필요 없다는 것이 장점이다.

**(b) key 로 지우는 엔드포인트**

```
DELETE /api/auth/user/files   { "keys": ["<합성에 쓰려던 원본 key>", ...] }
```

- 자기 S3 루트(`S3Keys.userRoot(publicId)`) 아래 key 만 허용 — 합성 API 와 같은 검사
- 이미 없는 key 는 성공으로 친다(재시도 안전)

### 프론트가 할 일 ((b) 가 열리면)

`fourcutCompose.ts` 의 `uploadSources` 가 실패 시점에 이미 올라간 key 를 들고 있다.
지금은 개발 콘솔에만 남긴다 — 그 자리에서 삭제를 부르면 된다.
합성 접수 이후 실패도 `sourceKeys` 를 그대로 넘기면 정리된다.

### 감수하는 것 ((a)·(b) 둘 다 없을 때)

깨지는 화면은 없다. 남는 객체는 본인 S3 루트 아래이고, 처리방침상 탈퇴 확정 시 파기 대상이다
(`packages/shared/src/legal.ts`). 다만 스토리지 비용과 **불필요한 얼굴 사진 보관**이 쌓인다.

---

## 5. 요금제 한도를 언제 켜는가 (답 대기)

이것도 셸과 무관하다. 창구가 같아 여기 모아 둔다.

### 절반은 이번에 닫혔다 — 답은 "맞다"

열려 있던 질문은 「백엔드가 등급별 한도를 안 걸고 있는 것 같은데 맞나」였다.
**맞다. 세 등급이 전부 무제한이다.** 2026-09-01 재확인, 근거 셋:

1. 갓 만든 BASIC 계정의 `GET /api/auth/user/subscription/usage` →
   `{"planTier":"BASIC","frameRetentionLimit":-1,"frameRetentionRemainingCount":-1,"frameRetentionUnlimited":true}`
   — 같은 필드의 스웨거 설명은 「BASIC 0 / PLUS 3 / PRO -1」로 정반대다.
2. 그 계정으로 프레임을 저장하면 200 이다(`SUBS-003` 이 안 난다).
3. jar 의 `com/harucut/subscription/enums/PlanTier.class` 상수풀에는
   `FrameLimit$Unlimited`·`Retention$Unlimited` **둘만** 있다.
   `subscription/policy/` 에 `FrameLimit$Limited`·`Retention$Days`·`Retention$Months` 클래스가
   **분명히 존재하는데도** `PlanTier` 는 그중 아무것도 참조하지 않는다 — 만들어만 두고 안 붙였다.

화면이 갈리는 지점과 자세한 실측은 [`docs/backend-contract.md`](./backend-contract.md)
「모든 등급이 무제한」 절이 소유한다. 여기 옮겨 적지 않는다.

### 남은 질문 둘

**(a) `PlanTier` 를 한도 구현체에 언제 붙이나.**
결제 오픈에 맞추는 것인지, 그 전에 켜는 것인지에 따라 프론트가 할 일이 갈린다 —
의도된 개방이면 가격표 문구를 「결제 오픈 전까지 모두 무제한」으로 바꾸고,
정책이 빠진 것이면 프론트는 그대로 두면 맞는다.

⚠️ 물어볼 때 **「결제가 닫혀 있어서(`PAYMENTS_ENABLED=false`) 일부러 열어 둔 것 아니냐」고
말하지 말 것.** `PAYMENTS_ENABLED` 는 백엔드 설정이 아니라 우리 쪽 상수다
(`packages/shared/src/company.ts:44`). 컨테이너 환경변수에는 그런 이름이 없다.

**(b) 보관 *기간*을 알 방법이 없다.**
`SubscriptionUsageResponse` 는 필드가 다섯인데 전부 프레임 **개수**다
(`planTier`, `frameRetentionLimit`, `frameRetentionUsedCount`,
`frameRetentionRemainingCount`, `frameRetentionUnlimited`). 기간에 해당하는 값이 없으니
화면에서 보관 기간을 말하려면 정적 표에 의존할 수밖에 없다 —
서버가 실제로 며칠 뒤에 지우는지 프론트는 알 길이 없다. 개수처럼 기간도 필드 하나가 필요하다.

---

## 6. 프레임 수정 시각을 응답에 넣어 주세요 (있으면 좋음)

**무엇을**: `FrameResponse` 에 `updatedAt`(또는 `version`) 한 필드.

**왜**: 합성 멱등키를 무엇으로 잡을지가 여기 걸린다. 같은 키로 다시 오면 서버가 기존 작업을
그대로 재생하는데(`ComposeRequest.idempotencyKey` 설명), 사용자가 테마 에디터로 프레임 **내용**을
고쳐도 `frameId` 는 그대로다. 그래서 수정 전 결과가 재생된다.

지금은 **조회로 받은 내용에서 지문을 만들어** 우회하고 있다(`lib/shootSessionStore.ts` 의
`buildFrameContentKey`). 컴포넌트·배경·칸 누끼를 순서 안정 직렬화하고, 조회할 때마다 새로 서명되는
URL(`renderUrl`·`background.url`)은 뺀다 — 넣으면 내용이 그대로인데도 매번 새 키가 나간다.

지문만으로는 구멍이 하나 남았다 — **첫 조회가 실패하면 지문이 없는 채로 남고**, 그 뒤 프레임을
고쳐도 새 키를 잡지 못했다. 그래서 **편집기 저장 시점에도 키를 버리게 했다**
(`components/theme/editor/ThemeEditorPage.tsx` → `shootSessionStore.noteRemoteFrameEdited`).
저장은 조회와 달리 실패할 수 없는 사실이라, 지문을 못 읽었어도 내용이 바뀐 것은 확실하다.

**남은 것은 우리 편집기 밖에서 고친 경우뿐이다** — 다른 기기·다른 세션에서 같은 계정으로
프레임을 고치면 이쪽 세션은 조회로만 알 수 있고, 그 조회가 실패하면 여전히 옛 키가 나간다.
서버가 수정 시각을 주면 이것까지 사라지고, 프론트가 응답 모양 전체를 지문으로 쓰지 않아도 된다.

**급하지 않다** — 위 두 겹으로 대부분의 경우가 덮인다.

---

## 7. 셀 누끼를 서버가 그리는지 알려 주세요 (답 대기)

**무엇을**: `ComposeSpec.cellCutouts` 를 합성 Lambda 가 실제로 그리는가.

**왜 묻나**: 스웨거와 이 레포의 실측 기록이 정면으로 다르다.

| | 말하는 것 |
|---|---|
| `FrameCreateRequest.cellCutouts` 스웨거 설명 | "**서버는 이 값으로 아무것도 그리지 않는다** — 누끼는 프론트가 원본 픽셀에 구워서 업로드해야 한다" |
| `docs/backend-contract.md` 실측 기록 | "된다 — 켠 칸만 가장자리가 어두워졌다(`rgb(55,9,10)` vs `rgb(0,255,0)`)" |

jar 에서 `ComposeSpecAssembler` 가 `Frame.getCellCutouts()` 를 읽어 `ComposeSpec` 에 싣는 것까지는
확인했다. 다만 실제 렌더는 jar 밖 Lambda(`LambdaComposeExecutor`)라 여기서는 못 본다.

**프론트는 스웨거를 따랐다.** 업로드 전에 원본 픽셀에 배경 제거를 굽는다
(`lib/canvas/personCutout.ts` — MediaPipe selfie_segmenter, 실기기 갤럭시 A32 에서 장당 0.9~1.2초).
그러니 **Lambda 도 그리고 있다면 두 번 그려진다.** 어느 쪽이 맞는지 알려 주시면 한쪽을 끄겠다.

---

## 참고 — 이번 세션에 확인한 것 (2026-09-01)

**1~4번은 오늘도 그대로 막혀 있고, 5~7번은 답 대기다.** 로컬 백엔드
(`popeye0618/harucut@sha256:d2bdf90f191abcc7…`, 2026-08-28 빌드, 경로 53개)로 재확인:

| 요청 | 확인한 것 | 상태 |
|---|---|---|
| 1. OAuth 교환 | `/v3/api-docs` 에 `exchange` 를 포함한 경로 **0건**. `CustomOAuth2SuccessHandler` 상수풀에 `/oauth2/callback`·`frontendUrl` 만 있고 앱 스킴 문자열이 없다 | **막힘** |
| 2. 익명 합성 | `guest`·`anon`·`event` 를 포함한 경로 **0건**. 인증 없이 compose → `401 AUTH-010` | **막힘** |
| 3. 기기 토큰 등록 | `push`·`device`·`token`·`notif` 로 거른 경로 **0건** | **막힘** |
| 4. 원본 파일 삭제 | `DELETE` 가 있는 경로는 7개뿐 — `admin/frames`·`admin/notices`·`admin/terms`·`user/frame/{id}`·`user/media/{id}`·`exit`·`logout`. **파일(key) 을 지우는 경로는 없다** | **막힘** |
| 5. 요금제 한도 | 위 절 — 「무제한이 맞나」는 닫혔고, 「언제 켜나」가 남았다 | **답 대기** |
| 6. 프레임 수정 시각 | `FrameResponse` 에 `updatedAt`·`version` 이 **없다**(2026-09-02 `/v3/api-docs`). 프론트는 조회한 내용의 지문으로 우회한다(`lib/shootSessionStore.ts` `buildFrameContentKey`), 그리고 편집기 저장 시점에도 멱등키를 버린다(`ThemeEditorPage` → `noteRemoteFrameEdited`) | **답 대기 · 급하지 않음** |
| 7. 셀 누끼를 Lambda 가 그리나 | jar 의 `ComposeSpecAssembler` 가 `cellCutouts` 를 `ComposeSpec` 에 싣는 것까지만 확인. 실제 렌더는 jar 밖(`LambdaComposeExecutor`)이라 여기서 못 본다. 프론트는 업로드 전에 이미 굽는다 | **답 대기** |

계약 사실(응답 봉투·스키마·에러코드·업로드 타입 개명)은 이 문서가 소유하지 않는다.
정본은 [`docs/backend-contract.md`](./backend-contract.md) 다.
인증코드 TTL·쿨다운 같은 로컬 실행 값은 [`docs/local-backend.md`](./local-backend.md) 가 소유한다.
