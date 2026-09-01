# 앱 웹뷰 셸 — 백엔드에 필요한 것

앱이 자기 화면을 그리지 않고 웹을 띄우는 구조로 바뀌었다(ADR-0003). 그 결과 **백엔드 쪽에
세 가지가 필요해졌다.** 전부 프론트에서는 우회할 방법이 없다.

우선순위 순으로 적는다. 1번이 없으면 앱에서 **소셜 로그인이 불가능**하고, 2번이 없으면
비회원·행사 참가자가 서버 합성 결과물을 받지 못한다. 3번은 없어도 앱은 돌지만
서버가 사용자에게 먼저 말을 걸 수단이 없다.

4번은 셸과 무관한 서버 합성 건이다. 창구가 같아 여기 모아 둔다.

---

## 1. OAuth 세션을 앱으로 넘기는 일회용 코드 (필수)

### 왜 필요한가

웹 로그인은 백엔드 OAuth 엔드포인트로 **전체 페이지 이동**한다.

```ts
// apps/web/lib/authLogin.ts
window.location.href = `${backendBase}/oauth2/authorization/${provider}`;
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

익명으로 부를 수 있는 경로는 백엔드 전체에 하나도 없다(컨트롤러 21개 전수 확인).

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
@RequestMapping("/api/auth/user/files")   // FileController — presigned-upload 뿐
```

프론트에는 지울 방법이 없다. 파일을 지우는 경로가 계약에 없고(프록시의 DELETE 는
`user/media/{mediaId}`·`user/frame/{frameId}`·로그아웃·탈퇴뿐), 원본은 보관함에 등록되지
않아 mediaId 도 없다. 남는 것은 **얼굴이 담긴 슬롯 크기 JPEG 4장**(장당 최대 4MP)이다.

남는 경로는 둘이다.

- 업로드 도중 한 장이 실패 — 이미 올라간 나머지가 남는다
- 4장이 다 올라간 뒤 `POST /api/auth/user/media/compose` 또는 폴링이 실패 — 4장이 다 남는다

사용자가 재시도를 누르면 멱등키가 새로 만들어져(`apps/web/app/shoot/result/page.tsx`)
원본 4장을 처음부터 다시 올린다. 실패 1회당 최대 4개가 쌓인다.

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

## 5. 참고 — 지금 확인된 사실들

| 항목 | 상태 |
|---|---|
| 서버 합성 `POST /api/auth/user/media/compose` | **살아 있고 우리가 쓴다** (2026-08-21 실측) |
| 업로드 타입 | `FOURCUT_SOURCE` — 개명 완료. `FOURCUT_PHOTO` 는 400 GEN-006 |
| 완성본 등록 `POST /api/auth/user/media` | **삭제됨(405)** — 결과물은 서버 합성으로만 만든다 |
| 이메일 인증 유효시간 | Redis TTL **10분** (지나면 가입 시 `AUTH-004`) |

개명은 이미 반영했다. 두 이름을 번갈아 시도하던 폴백은 제거했다 —
지금 계약에 이름은 하나뿐이라 폴백이 오히려 실패를 늦게 드러낸다.
정본은 [`docs/backend-contract.md`](./backend-contract.md) 다.
