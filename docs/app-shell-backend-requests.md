# 앱 웹뷰 셸 — 백엔드에 필요한 것

앱이 자기 화면을 그리지 않고 웹을 띄우는 구조로 바뀌었다(ADR-0003). 그 결과 **백엔드 쪽에
두 가지가 필요해졌다.** 둘 다 프론트에서는 우회할 방법이 없다.

우선순위 순으로 적는다. 1번이 없으면 앱에서 **소셜 로그인이 불가능**하고, 2번이 없으면
비회원·행사 참가자가 서버 합성 결과물을 받지 못한다.

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

## 3. 참고 — 지금 확인된 사실들

| 항목 | 상태 |
|---|---|
| 서버 합성 `POST /api/auth/user/media/compose` | **살아 있고 우리가 쓴다** (2026-08-21 실측) |
| 업로드 타입 | `FOURCUT_SOURCE` — 개명 완료. `FOURCUT_PHOTO` 는 400 GEN-006 |
| 완성본 등록 `POST /api/auth/user/media` | **삭제됨(405)** — 결과물은 서버 합성으로만 만든다 |
| 이메일 인증 유효시간 | Redis TTL **10분** (지나면 가입 시 `AUTH-004`) |

개명은 이미 반영했다. 두 이름을 번갈아 시도하던 폴백은 제거했다 —
지금 계약에 이름은 하나뿐이라 폴백이 오히려 실패를 늦게 드러낸다.
정본은 [`docs/backend-contract.md`](./backend-contract.md) 다.
