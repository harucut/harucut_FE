# 인증 및 리다이렉트 규칙

## 공개 라우트와 보호 라우트

공개 라우트:

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/features`
- `/enterprise`
- `/faq`
- `/pricing`
- `/privacy`
- `/terms`
- `/oauth2/callback`

보호 라우트 — 다섯이고, **전부 접두사 판정**입니다(`/history/…`도 보호 대상):

- `/home`
- `/shoot`
- `/history`
- `/theme`
- `/mypage`

미들웨어 진입점은 [`apps/web/proxy.ts`](../apps/web/proxy.ts)이고,
보호 경로 판정은 [`apps/web/lib/protectedPaths.ts`](../apps/web/lib/protectedPaths.ts)의
`PROTECTED_PATHS` + `isProtectedPath`에 있습니다. 위 목록은 그 상수의 사본이므로,
**라우트가 늘면 코드를 고치고 여기를 맞춥니다**(반대 방향이 아닙니다).
[`apps/web/lib/routeContracts.test.ts`](../apps/web/lib/routeContracts.test.ts)가 그 목록을
계약으로 고정합니다.

`proxy.ts`의 `config.matcher`는 별개입니다 — 미들웨어를 **어떤 요청에 돌릴지** 정합니다.
지금 `/mypage`만 `:path*` 없이 걸려 있는데, 오늘은 하위 페이지가 없어서 문제가 없습니다.
`/mypage/...`를 만든다면 matcher부터 넓혀야 합니다. `isProtectedPath`는 접두사 판정이라
그 경로도 보호 대상으로 보지만, 미들웨어가 안 돌면 판정할 기회 자체가 없습니다.

matcher에는 보호 라우트가 아닌 `/oauth2/callback`도 들어 있습니다. 막으려고 넣은 것이
아니라 **게스트 쿠키를 걷으러** 들어가는 것입니다(아래 「게스트 쿠키는 소셜 콜백에서만
걷는다」). 그 문자열은 `proxy.ts`의 `SOCIAL_LOGIN_CALLBACK` 상수와 같아야 하고
(matcher는 Next가 빌드 때 읽어서 상수를 못 쓴다),
[`apps/web/proxy.test.ts`](../apps/web/proxy.test.ts)의
"콜백 경로가 matcher 에 들어 있다"가 그 일치를 고정합니다.

검색 노출 대상 공개 페이지는
[`apps/web/app/sitemap.ts`](../apps/web/app/sitemap.ts)와 일치시킵니다
(인증 페이지는 noindex라 sitemap에서 제외 — 지금 sitemap은 위 공개 목록에서
`/login`·`/signup`·`/forgot-password`·`/oauth2/callback` 넷을 뺀 7개입니다).

## redirectTo 계약

미들웨어가 보호 라우트를 막으면 원래 경로와 쿼리까지 포함해서 로그인으로 보냅니다.

```text
/login?redirectTo=<원래 경로와 쿼리>
```

예시:

```text
/mypage                    -> /login?redirectTo=/mypage
/shoot/capture?mode=retry  -> /login?redirectTo=/shoot/capture?mode=retry
```

로그인 성공 후에는 `redirectTo`가 안전한 내부 경로일 때 그곳으로 복귀합니다.
안전하지 않거나 비어 있으면 `/home`으로 이동합니다.

안전한 리다이렉트 파싱은 [`apps/web/lib/redirect.ts`](../apps/web/lib/redirect.ts)에 있습니다.

## 게스트 체험 모드

가입 없이 촬영을 체험하는 경로입니다. 판단 기준은 쿠키 하나
(`GUEST_TRIAL_COOKIE = "harucut_guest_trial"`, 값 `"1"`)입니다.

미들웨어 분기 순서([`apps/web/proxy.ts`](../apps/web/proxy.ts)):

0. `DEV_AUTH_BYPASS`가 켜져 있으면 아래 판정을 전부 건너뛴다(아래 절 참고)
1. **소셜 로그인 콜백(`/oauth2/callback`)이면 통과** — 보호 경로 판정보다 먼저 본다.
   여기서만 게스트 쿠키를 걷고, 그것도 **살아 있는 access 토큰이 함께 있을 때만** 걷는다(아래 절 참고)
2. 보호 경로가 아니면 그대로 통과
3. **행사 QR 진입(경로가 정확히 `/shoot` + 공백 아닌 `event` 쿼리)이면 통과** — **쿠키가
   하나도 없을 때만** 게스트 쿠키를 심는다(`!hasAuthCookie(req)`). 이미 게스트 쿠키가 있거나
   인증 쿠키가 **하나라도** 있으면 심지 않고 아래로 내려간다. 인증 쿠키가 남은 브라우저의
   판정은 미들웨어가 하지 않고 화면(`app/shoot/page.tsx` 의 `resolveMembership()`)이 한다
   (아래 절 참고)
4. **살아 있는 access면 통과** — 미들웨어가 그 자리에서 확인할 수 있는 유일한 "지금 회원"
   근거다. 게스트 쿠키가 함께 있어도 **걷지 않고**, 5의 게스트 차단도 적용하지 않는다
5. **게스트 쿠키가 있으면** `isGuestAllowedPath(pathname)`로 가른다 — **인증 쿠키 판정(6)
   보다 먼저 본다**(아래 「`/shoot/upload`는…」 절)
   ([`apps/web/lib/protectedPaths.ts`](../apps/web/lib/protectedPaths.ts) — 상수 둘도 여기 있다)
   - `GUEST_MEMBER_ONLY_PREFIXES`(`/shoot/upload`)에 걸리면 **먼저 막는다**
   - 남은 것 중 `GUEST_ALLOWED_PREFIXES`(`/shoot`)로 시작하면 통과 —
     비회원에게 여는 범위는 "찍고 그 사진을 받는 것"까지다
   - 그 외 보호 경로: `/shoot?guestNotice=restricted`로 리다이렉트
6. 인증 쿠키(`accessToken` 또는 `refreshToken`)가 **있기만 하면** 통과 — 유효성은 보지
   않는다. 게스트 쿠키가 없는 사람만 여기 닿는다(있으면 5에서 갈렸다)
7. 그 외에는 `/login?redirectTo=...`

**6이 왜 맨 아래인가**가 이 흐름의 전부입니다. 6은 쿠키가 있는지만 보므로 죽은 토큰도
"로그인"으로 읽습니다. 그래서 5(게스트 차단)를 6보다 앞에 뒀습니다 — 6이 먼저였을 때는
「게스트 쿠키 + `refreshToken` 쿠키」를 든 사람이 회원 전용 경로를 그냥 지나갔습니다.

3(행사 진입)도 6보다 앞이지만 **6과 겹치지 않습니다** — 3이 심는 조건이 「쿠키가 하나도
없을 때」라, 6에 닿는 사람에게는 애초에 3이 아무것도 하지 않습니다. 한때 3이
「살아 있는 access 가 아니면 심는다」였고 그때는 진짜로 6을 가로챘는데, 그 판정이 access만
자연 만료된 **멀쩡한 회원**에게 7일짜리 체험 쿠키를 심어 기록·저장 프레임을 잃게 했습니다.
되돌리지 마세요.

```text
/oauth2/callback + 살아 있는 access O + 게스트 O   -> 통과 (게스트 쿠키 삭제)
/oauth2/callback + 살아 있는 access X              -> 통과 (게스트 쿠키 그대로)
/shoot?...&event=... + 쿠키 없음                   -> 통과 (게스트 쿠키를 심는다)
/shoot?...&event=... + 죽은 access 만              -> 통과 (심지 않는다 — 화면이 판정한다)
/shoot?...&event=... + refresh 쿠키만              -> 통과 (심지 않는다 — 화면이 판정한다)
/shoot?...&event=... + 살아 있는 access            -> 통과 (심지 않는다 — 지금 회원인 것이 확인된다)
/shoot?...&event=... + 게스트 쿠키 O               -> 통과 (이미 체험 중, 다시 심지 않는다)
/shoot(event 없음)·/shoot/... + 쿠키 없음          -> /login  ← 행사 진입이 아니다
살아 있는 access O (보호 경로 전부)                -> 통과 (게스트 쿠키가 있어도 그대로 둔다)
게스트 쿠키 O + /shoot/upload                      -> /shoot?guestNotice=restricted  ← 회원 전용
게스트 쿠키 O + 그 밖의 /shoot/*                   -> 통과
게스트 쿠키 O + 그 외 보호 경로                    -> /shoot?guestNotice=restricted
게스트 쿠키 O + 죽은 인증 쿠키                     -> 위 세 줄 그대로  ← 5가 6보다 먼저
게스트 쿠키 X + 인증 쿠키 O                        -> 통과 (유효성은 보지 않는다)
쿠키 없음                                          -> /login?redirectTo=<원래 경로와 쿼리>
```

"죽은 access"는 `exp`가 지났거나 JWT로 읽히지 않는 `accessToken` 쿠키를 말합니다
(`hasLiveAccessToken`). 4에서 「지금 회원」의 근거로 쓰는 것이 이 값 하나입니다 —
**`refreshToken`은 살아 있음의 근거로 쓰지 않습니다.** 다른 기기 로그인으로 서버가 회수해도
브라우저에는 그대로 남아, 쿠키만으로는 산 것과 구별되지 않기 때문입니다. 구별이 필요한
자리(행사 진입)에서는 **미들웨어가 점치지 않고 화면이 물어봅니다**(아래 절).

### 게스트 쿠키는 소셜 콜백에서만 걷는다

예전에는 **보호 경로에서 인증 쿠키만 보이면** 게스트 쿠키를 지웠습니다. 지금은 그러지
않습니다 — 지우는 자리는 소셜 로그인 콜백 하나뿐입니다.

통과 판정(위 6)이 보는 것은 쿠키가 **있는지**뿐입니다. 서버가 이미 회수했는지는 백엔드에
물어야 알 수 있고 미들웨어는 묻지 않으므로, 죽은 토큰도 거기서는 "로그인"으로 읽힙니다.
그 상태에서 지우면, 죽은 쿠키를 든 방문자가 "가입 없이 찍어보기"로 방금 심은 게스트 쿠키를
**다음 요청에서 도로 잃습니다.** 그 화면은 메모리 값으로 버티지만, 새로고침 한 번이면
`hydrateGuestMode`([`guestTrialStore.ts`](../apps/web/lib/guestTrialStore.ts))가 쿠키를 못
찾아 회원으로 되돌아가고, 촬영 화면이 인증 API에서 401을 받아 "로그인이 풀렸어요"로
끝납니다. 몇 번을 눌러도 체험이 시작되지 않습니다.

콜백이 그 자리인 이유는, 백엔드가 소셜 인가를 마치고 **인증 쿠키를 심은 뒤** 그 주소로
돌려보내기 때문입니다([`docs/mobile-shell.md`](./mobile-shell.md) 「소셜 로그인」 절의
"지금 흐름 (실측)" — `CustomOAuth2SuccessHandler` 가 `Set-Cookie` 를 붙여 302 로 보냅니다).
다만 **쿠키가 있다는 것만으로는** 방금 로그인했다고 볼 수 없습니다. 만료된 토큰을 든 채
체험을 시작한 사람이 인가에 실패한 복귀나 브라우저 기록으로 이 주소에 들어오면, 로그인은
못 한 채 체험까지 잃습니다. 그래서 access JWT 의 `exp` 를 읽어 **아직 살아 있을 때만**
걷습니다(서명은 검증하지 않습니다 — 그건 백엔드 일이고, 여기서 가리려는 것은 "죽은 토큰"
하나입니다). refresh 쿠키는 보지 않습니다: 다른 기기 로그인으로 만료 전에 회수될 수 있어
살아 있음을 증명하지 못합니다([`docs/backend-contract.md`](./backend-contract.md) 「토큰」 —
access 는 무상태로 `exp` 까지 통과하고, 회수 대상은 Redis 의 refresh 뿐입니다).

콜백 페이지는 성공하면 `window.location.href`로 문서를 새로 받아 zustand에 남은 게스트
상태를 비우지만, **쿠키는 문서를 새로 받아도 살아남습니다.** 그대로 두면 체험하다 가입한
사람이 로그인을 마친 뒤에도 계속 비회원으로 읽혀 자기 프레임과 기록을 못 봅니다.
이메일 로그인은 같은 일을 클라이언트에서 합니다 —
[`apps/web/app/login/page.tsx`](../apps/web/app/login/page.tsx)의 `exitGuestMode()`.

회귀 고정: [`apps/web/proxy.test.ts`](../apps/web/proxy.test.ts)의 「proxy 회원 전환」
네 가지 — "인증 쿠키가 남아 있어도 비회원 체험 쿠키를 지우지 않는다",
"소셜 로그인 콜백에서는 체험 쿠키를 걷는다", "콜백에 빈손으로 돌아왔으면 체험을 그대로 둔다",
그리고 "콜백에 … 만 들고 왔으면 체험을 그대로 둔다"(만료된 access·형식이 다른 토큰·
**페이로드가 base64가 아닌 토큰**·**페이로드가 JSON이 아닌 토큰**·refresh 토큰만).
뒤의 둘은 JWT 파싱이 던지는 자리(`hasLiveAccessToken`의 `catch`)에 닿는 유일한 케이스입니다 —
점이 없는 쿠키는 파싱 전에 돌아 나오기 때문에, 그 둘이 없으면 `catch`가 `true`를 돌려주도록
뒤집어도 이 파일 전체가 통과했습니다.

### `/shoot/upload`는 `/shoot` 아래지만 회원 전용이다

갤러리 불러오기는 원래 `/upload`(회원 전용)였다. 촬영 흐름으로 합치면서 `/shoot/upload`로
옮겨 왔는데, `/shoot` 접두사 허용이 **비회원에게도 딸려 열어 버렸다.** 그래서
`GUEST_MEMBER_ONLY_PREFIXES`가 따로 있고, 판정에서 허용보다 **먼저** 걸린다.

범위를 정하는 곳과 집행하는 곳이 다르다. 약관 제8조와 `@harucut/shared`의
`GUEST_ALLOWED_ITEMS`가 비회원 범위를 "사진 촬영과 이미지 저장"으로 못박고,
`protectedPaths.ts`가 그것을 경로로 집행한다. 코드가 약관보다 넓으면 화면이 거짓말을 한다.

경계는 접두사가 아니라 세그먼트로 본다(`hasPrefix`) — `/shoot/uploads`는 막히지 않는다.

**이 차단은 인증 쿠키 통과(위 6)보다 먼저 걸려야 한다.** 6은 쿠키가 있는지만 보므로,
「게스트 쿠키 + `refreshToken` 쿠키」를 든 방문자가 6에서 먼저 통과해 이 차단에 **닿지도
못했다.** 그 조합은 지금도 만들어진다 — 인증 쿠키가 남은 브라우저로 QR을 찍으면 화면이
회원이 아니라고 판정할 때 `enterGuestMode()`가 체험 쿠키를 심고 refresh 쿠키는 그대로다
(위 「행사 QR 진입」). 화면 쪽 방어도 없다:
[`apps/web/app/shoot/upload/page.tsx`](../apps/web/app/shoot/upload/page.tsx)는 `accessMode`를
보지 않으므로 프록시가 유일한 집행 지점이다. 살아 있는 access를 든 사람만 이 차단을
비켜간다(위 4) — 그 사람은 실제로 회원이라 인증 API가 답한다.

**한계.** 이 차단은 인가가 아니라 "우리가 게스트로 그려 주고 있는 화면"을 막는 것이다.
브라우저에서 체험 쿠키를 지우고 `refreshToken`에 아무 값이나 넣으면 6으로 지나간다(값을
보지 않는다). 실제 집행은 백엔드가 한다 — 백엔드에 비회원 개념이 없어 인증 API가 401이다.

회귀 고정: [`apps/web/lib/routeContracts.test.ts`](../apps/web/lib/routeContracts.test.ts)의
"갤러리 불러오기는 회원만" / "이름이 비슷한 다른 경로까지 막지는 않는다",
[`apps/web/proxy.test.ts`](../apps/web/proxy.test.ts)의
「proxy 게스트 쿠키와 죽은 인증 쿠키가 함께 있을 때」(회원 전용 경로·촬영 밖 보호 경로는
막고, 촬영 흐름은 지나가고, 살아 있는 access를 들었으면 통과),
그리고 `apps/web/tests/e2e/guards.spec.ts`의 `guestBlockedRoutes = ["/history", "/theme", "/shoot/upload"]`.

### 주소 모양 — 판정 전에 정규화한다

App Router는 한 라우트를 사람이 치는 주소로만 부르지 않는다. 세그먼트 프리페치는
`/shoot/upload.segments/_tree.segment` 같은 주소로 들어온다. 프록시가 받는
`nextUrl.pathname`에는 그 꼬리표가 그대로 남아 있어서, 문자열을 있는 그대로 비교하면
**같은 페이지인데 회원 전용 판정만 빗나갔다** — 게스트 쿠키로 그 주소를 부르면
`/shoot/upload` 차단을 지나쳐 `/shoot` 허용에 걸렸다.

`toRoutePath()`(protectedPaths.ts)가 세그먼트마다 첫 `.`에서 잘라 한 갈래로 되돌린다.
꼬리표를 나열해 지우지 않는 이유는, 새 꼬리표가 생겨도 열리는 쪽이 아니라 닫히는 쪽으로
떨어지게 하기 위해서다. `isGuestAllowedPath`는 허용·차단을 **둘 다** 정규화한 주소로 본다 —
한쪽만 정규화하면 주소 모양에 따라 판정이 갈린다.

비대칭이 하나 있고, 의도된 것이다. `isProtectedPath`와 `proxy.ts`의 `isEventEntry`는
정규화를 쓰지 않는다. 둘 다 정규화하지 않으면 **닫히는 쪽**으로 떨어지기 때문이다
(꾸민 주소는 여전히 보호 경로로 잡히고, 행사 QR 예외는 정확히 `/shoot`일 때만 열린다).

이 규칙을 다시 구현하려는 사람에게: `toRoutePath` 자체를 부르는 단위 테스트는 **아직 없다**.
`routeContracts.test.ts`가 잡는 것은 `/shoot/upload`와 `/shoot/uploads` 경계까지고,
정규화가 실제로 걸리는지는 `proxy.test.ts`가 주소 여덟 모양(`UPLOAD_ADDRESSES`)을
프록시에 통과시켜 간접적으로만 고정한다.

### 행사 QR 진입 (미들웨어는 심기만, 판정은 화면이)

행사장에서 QR을 찍은 참가자는 **대개** 쿠키가 하나도 없는 새 브라우저로 도착합니다.
이 예외가 없으면 미들웨어가 `/login`으로 먼저 돌려보내서, "가입 없이 바로 찍는다"는
행사 흐름이 정작 행사장에서만 동작하지 않습니다.

"대개"가 이 절의 전부입니다. 예전에 이 브라우저로 로그인했던 사람도 QR을 찍고, 그 쿠키가
아직 살아 있는지는 **미들웨어가 알 수 없습니다.**

- **미들웨어는 쿠키가 하나도 없을 때만 심습니다.** 판정 조건 셋을 모두 만족할 때입니다.
  1. 경로가 정확히 `/shoot`이고 `event` 쿼리
     (`EVENT_ENTRY_QUERY`, [`apps/web/lib/guestTrialShared.ts`](../apps/web/lib/guestTrialShared.ts))에
     공백이 아닌 값이 있을 것. 하위 단계(`/shoot/capture` 등)는 여기서 심긴 쿠키로 이어집니다.
  2. 게스트 쿠키가 아직 없을 것(있으면 이미 체험 중이라 다시 심을 이유가 없습니다).
  3. **인증 쿠키가 하나도 없을 것**(`!hasAuthCookie(req)`). 물어볼 상대가 없는 방문자라
     여기서 심지 않으면 `/shoot`이 보호 경로라 로그인으로 튕깁니다.
- **인증 쿠키가 남은 브라우저는 그냥 통과시키고, 판정은 화면이 합니다.**
  [`apps/web/app/shoot/page.tsx`](../apps/web/app/shoot/page.tsx)가
  [`lib/authSession.ts`](../apps/web/lib/authSession.ts)의 `resolveMembership()`으로 물어봅니다 —
  `clientApi`를 쓰므로 401이면 **재발급을 한 번 하고 다시 시도**합니다. 답은 셋입니다:
  `member`(아무것도 하지 않는다) · `guest`(그때 `enterGuestMode()`) ·
  `unknown`(못 물어봤다 — 5xx·회선 끊김·재발급 서버 장애. **아무것도 하지 않는다**).
- **왜 미들웨어에서 묻지 않는가.** 만료된 access로는 `/api/auth/status`가 401이라
  (백엔드는 refresh를 access로 받지 않습니다 — [`docs/backend-contract.md`](./backend-contract.md)
  「토큰」의 AUTH-011 표) `reissue`를 불러야 하는데, 그것은 **토큰을 회전시키는 쓰기 요청**입니다.
  프록시는 RSC 프리페치를 포함한 모든 요청에 붙어 한 번의 진입이 여러 번 회전시킬 수 있고,
  미들웨어가 돌려받은 새 쿠키를 응답에 실어 주지 못한 회전은 그대로 버려집니다.
  그 버려진 회전이 멀쩡한 세션을 실제로 끊는지는 **확인하지 않았습니다 — 추측입니다**
  (계약 문서에 있는 것은 "이전 refresh가 `REFRESH_GRACE:<jwt>`로 남는다" 한 줄뿐이고,
  유예의 개수·수명은 적혀 있지 않습니다). 확인된 것만 놓고 봐도 모든 진입에 검증 안 된
  쓰기를 거는 쪽의 위험이 더 큽니다. 화면은 답을 받아 쿠키를 실을 수 있고 회전도 한 번뿐입니다.
- **되돌리지 말아야 할 두 갈래.**
  - 한때 3이 「살아 있는 access가 아니면 심는다」(`hasLiveAccessToken`)였습니다. 회수된
    refresh를 든 참가자를 회원으로 오해해 막지 말자는 뜻이었는데, 반대쪽을 더 크게 깼습니다 —
    access만 자연 만료되고 refresh는 멀쩡한 회원(흔합니다)이 7일짜리 체험 쿠키를 받았고,
    `clientApi`가 재발급에 성공한 뒤에도 `guestTrialStore`는 그 쿠키만 보고 게스트로 복원해
    기록·커스텀 프레임을 잃었습니다. 진입 시점만의 이야기도 아닙니다 — 같은 주소가 촬영 화면의
    "프레임 다시 선택" 목적지라
    ([`apps/web/app/shoot/capture/page.tsx`](../apps/web/app/shoot/capture/page.tsx)의
    `backToFrameHref`) 촬영 도중에도 같은 판정이 다시 돕니다.
  - 그 앞에는 「`refreshToken` 쿠키가 있기만 해도 심지 않는다」(`hasRecoverableSession`)였는데,
    그때는 회수된 refresh를 든 참가자가 회원으로 읽힌 채 인증 API에서 401을 받아 행사 흐름이
    행사장에서 막혔습니다. **두 방향 다 쿠키로 점친 것이 원인이었습니다.**
- 통과할 때 응답에 `harucut_guest_trial=1`을 심습니다. 속성(`path=/`, `max-age`,
  `SameSite=Lax`, https에서만 `Secure`)은 클라이언트가 심는 것과 같은 값이어야 하므로
  `GUEST_TRIAL_COOKIE_MAX_AGE`를 공유합니다.
- **권한 관점**: 랜딩의 "가입 없이 찍어보기" 버튼을 누르면 누구나 얻는 것과 같은 자격입니다.
  즉 새로 여는 문이 아니라, 그 버튼을 누를 기회가 없는 사람에게 같은 문을 열어 주는 것입니다.
- **남는 한계**: 화면 쪽 전환은 조회 한 번을 기다립니다 — 그 사이(수백 ms)에는 회원 화면이
  잠깐 보입니다. 그리고 `unknown`으로 떨어진 방문자는 게스트가 되지 않으므로, 서버가 흔들리는
  동안 **진짜 비회원**은 `/shoot`을 열어도 회원 화면을 보다가 인증 API에서 막힙니다. 서버가
  돌아오면 다음 진입에서 판정됩니다. 멀쩡한 회원을 7일 동안 게스트로 두는 쪽보다 낫다고 봤습니다.
- 회귀 고정:
  - [`apps/web/proxy.test.ts`](../apps/web/proxy.test.ts)의 「proxy 행사 QR 진입」 —
    "쿠키가 없는 방문자에게는 심어서 로그인으로 튕기지 않는다", 죽은·살아 있는 쿠키 여덟
    모양에 대해 **"들고 오면 심지 않고 통과시킨다"**, "이미 체험 중이면 다시 심지 않는다",
    **"행사 진입이 아닌 주소는 로그인으로 보낸다"**(`event` 쿼리가 없거나 공백뿐일 때,
    그리고 `/shoot/upload`·`/shoot/capture` 처럼 `/shoot` 하위일 때),
    **"심는 체험 쿠키의 속성은 클라이언트와 같은 값이다"**.
  - [`apps/web/app/shoot/page.test.tsx`](../apps/web/app/shoot/page.test.tsx)의
    「행사 QR 진입의 게스트 전환」 — "회원이 아닌 것이 확인되면 체험을 시작한다",
    "회원으로 확인되면 아무것도 심지 않는다", **"판정할 수 없으면 게스트로 전환하지 않는다"**,
    "행사 진입이 아니면 회원 여부를 묻지 않는다", "이미 체험 중이면 다시 묻지 않는다".
  - [`apps/web/lib/authSession.test.ts`](../apps/web/lib/authSession.test.ts) — 판정 매핑 자체
    (200 정상·탈퇴요청/탈퇴/차단·401 뒤 재발급 성공·재발급해도 401·5xx·회선 끊김·재발급 장애).
  - `apps/web/tests/e2e/guards.spec.ts`의 "lets an event QR visitor shoot without signing up".

이 예외를 지우면 행사(B2B) 흐름이 통째로 죽습니다. 미들웨어에서 세션 유효성을 다시
점치려 들면 위 두 갈래 중 하나로 되돌아갑니다.
인증 분기를 정리할 때 함께 확인해 주세요.

관련 파일:

- [`apps/web/lib/authSession.ts`](../apps/web/lib/authSession.ts): `resolveMembership()` —
  `member`/`guest`/`unknown` 삼분 판정. 미들웨어가 못 하는 「재발급까지 해 보고 묻기」를
  여기서 한다(행사 진입과 공개 화면의 촬영 CTA 가 쓴다)
- [`apps/web/lib/guestTrialShared.ts`](../apps/web/lib/guestTrialShared.ts): 쿠키 이름 단일 출처
- [`apps/web/lib/guestTrialStore.ts`](../apps/web/lib/guestTrialStore.ts): `accessMode`(`guest`/`member`),
  쿠키 읽기·쓰기, 안내 문구(restricted / saved / share / trial)
- `apps/web/components/guest/*`: `GuestTrialStartButton`(체험 시작),
  `GuestTrialBridge`(쿠키로 `accessMode` 복원 + 로그인 후 보관한 원본 4장으로 서버 합성),
  `GuestTrialOverlay`(안내 표시)
- [`apps/web/lib/pendingGuestSave.ts`](../apps/web/lib/pendingGuestSave.ts):
  게스트가 저장을 누르면 **원본 4장과 만드는 방법**(고른 배경색 포함)을 localStorage에
  보관했다가 로그인 후 서버 합성으로 기록에 남긴다(완성본 PNG를 올리던 방식은 그 API가
  사라져 폐기됐다). 보관물은 하루가 지나면 버린다

**이 문서가 다루는 것은 "누가 어디를 지나갈 수 있나"까지입니다.** 게스트 결과물이 왜
브라우저에서 만들어지는지(= 백엔드에 비회원 개념이 없다), 왜 네이티브 브리지가 base64
조각으로 넘기는지, 그리고 **위 localStorage 보관이 보통 사진에서는 용량을 넘겨 실패한다는
실측**은 [README.md의 "비회원 구조" 절](./README.md)이 갖습니다. 인계가 안 된다는 신고를
받았다면 이 문서가 아니라 거기부터 봅니다.

보관물을 계정에 옮기는 규칙 두 가지입니다.

- **로그인 여부는 `/api/auth/session`에 묻습니다.** 게스트 쿠키가 없다는 것은 "체험 중이
  아니다"일 뿐 "로그인했다"가 아닙니다. 쿠키만 보고 합성을 부르면 로그아웃한 방문자에게
  401과 함께 "저장을 완료하지 못했어요"라는 거짓 실패가 뜨고, 보관물이 남아 하루 동안
  페이지를 열 때마다 반복됩니다.
- **저장 전에 사용자 확인을 받습니다.** 보관물에는 소유자 표식이 없고 24시간을 삽니다.
  확인 없이 자동 저장하면 공용 기기에서 앞사람이 만든 네컷이 뒷사람 계정 기록으로
  넘어갑니다. `GuestTrialBridge`가 "이 계정에 저장하기 / 버리기"를 묻고, 누른 뒤에만
  서버 합성을 시작합니다

게스트 체험은 촬영과 이미지 다운로드까지만 허용합니다. 기록 저장, 링크 공유 등
서버 연동 기능은 로그인 후 사용합니다.

## 소셜 로그인

KAKAO, NAVER, GOOGLE 3종을 지원합니다.

진입([`apps/web/lib/authLogin.ts`](../apps/web/lib/authLogin.ts)):

```text
loginKakao/loginNaver/loginGoogle
  -> startSocialLogin(provider, redirectTo)
       -> persistSocialLoginRedirect(redirectTo)
       -> persistSocialLoginProvider(provider)      ← 아래 DELETED_REQUESTED 복구가 이걸 쓴다
  -> window.location.href = `${NEXT_PUBLIC_BASE_URL}/oauth2/authorization/{kakao|naver|google}`
```

복귀 경로 보존([`apps/web/lib/socialLoginRedirect.ts`](../apps/web/lib/socialLoginRedirect.ts)):

- OAuth는 전체 페이지 리다이렉트라 메모리 상태가 날아갑니다.
  `persistSocialLoginRedirect`가 `getSafeRedirectPath`로 검증한 경로만
  sessionStorage(`social-login-redirect`)에 저장합니다.
- 콜백에서 `consumeSocialLoginRedirect`가 한 번 읽고 즉시 지웁니다.
- 같은 파일이 sessionStorage 키를 둘 더 씁니다 — `social-login-provider`(어느 제공자로
  나갔나)와 `social-login-reactivated`(재등록 재시도를 이미 한 번 했나). 둘 다 아래
  `DELETED_REQUESTED` 분기 전용이고, 그 분기가 존재하는 이유이기도 합니다.

콜백에 도착하면 페이지보다 미들웨어가 먼저 돕니다 — 게스트 쿠키를 걷는 자리가 거기입니다
(위 「게스트 쿠키는 소셜 콜백에서만 걷는다」).

콜백 처리([`apps/web/app/oauth2/callback/page.tsx`](../apps/web/app/oauth2/callback/page.tsx)):

1. `/api/auth/status`로 계정 상태를 조회한다(`userStatus` / `accountStatus` / `status` 중 먼저 잡히는 값)
2. `UserStatus`별 분기
   - `ACTIVE`: 복귀 경로(없으면 `/home`)로 이동
   - `DELETED_REQUESTED`: 아래 별도 절
   - `BLOCKED` / `DELETED`: 별도 화면 분기 없이 상태 값만 인식한다.
     접근 차단은 서버 응답(권한 오류)에 따른 공통 에러 처리로 흡수된다
3. 상태 조회 자체가 실패하면 로그아웃 후 `/login`

### `DELETED_REQUESTED` — 복구한 뒤 소셜 인가를 한 번 더 탄다

`window.confirm`으로 재등록 여부를 묻고, 거절하거나 `reactivateAccount()`가 실패하면
로그아웃 후 `/login`입니다. 수락했을 때가 특이합니다 — **복귀하지 않습니다.**

```text
reactivateAccount() 성공
  -> readSocialLoginProvider()
       제공자를 알고, 아직 재시도한 적 없으면
         -> markSocialLoginReactivated()
         -> startSocialLogin(provider, redirectTarget)   ← 인가를 다시 탄다 (1회 한정)
       모르거나 이미 한 번 했으면
         -> clearSocialLoginProvider() -> alert -> /login
```

이유는 콜백 코드 주석에 있습니다. 복구는 됐지만 지금 손에 든 쿠키에는
`status=DELETED_REQUESTED`가 박혀 있고, `reactivate`는 새 쿠키를 주지 않은 채 서버의
refresh 토큰까지 지웁니다. 이메일 로그인과 달리 여기엔 다시 쓸 자격증명이 없으므로,
들어온 소셜 인가를 한 번 더 태워 ACTIVE 토큰을 받습니다.
`consumeSocialLoginRedirect`가 이미 소비한 복귀 경로를 다시 심어 두 번째 콜백이 같은 곳으로
가게 하는 것도 이 자리입니다.

`social-login-reactivated`가 재시도를 1회로 묶습니다. 없으면 서버가 계속
`DELETED_REQUESTED`를 돌려줄 때 왕복이 끝나지 않습니다.

## DEV_AUTH_BYPASS (로컬 전용)

[`apps/web/lib/devAuthBypass.ts`](../apps/web/lib/devAuthBypass.ts)의 스위치입니다.

```text
DEV_AUTH_BYPASS = NODE_ENV !== "production" && NEXT_PUBLIC_DEV_AUTH_BYPASS === "1"
```

- 이중 잠금이라 `.env`에 값이 딸려가도 프로덕션 빌드에서는 항상 `false`입니다.
- 켜면 **이 문서의 보호 계약이 전부 꺼집니다.** 미들웨어는 보호 경로 판정 전에
  `NextResponse.next()`로 빠지므로 게스트 체험 분기도 타지 않습니다.
- 꺼지는 곳을 여기 나열하지 않습니다 — `DEV_AUTH_BYPASS`를 import 하는 곳이 곧 목록입니다
  (`grep -rn DEV_AUTH_BYPASS apps/web`). 지금은 `proxy.ts`, `SessionExpiryBridge`,
  `AccountRecoveryBridge`, `TermsConsentBridge` 넷이고, 약관 재동의 모달이 안 뜨는 이유를
  찾는 사람이 자주 여기서 헤맵니다.
- 그래서 E2E는 반드시 끈 상태로 실행합니다. 켜진 채로 돌리면 "비인증 접근 시
  로그인 리다이렉트" 시나리오가 통과하지 않고 조용히 깨집니다.

## 인증 페이지 내 이동 규칙

인증 페이지는 앱 내부 페이지와 다르게 동작하도록 정리되어 있습니다.

- 좌상단 브랜드 링크는 `/`로 이동한다 —
  [`AuthPageShell.tsx`](../apps/web/components/auth/AuthPageShell.tsx)의 `<BrandMark href="/" />`.
  흐름 화면의 `PageHeader`에는 브랜드 자리가 없다(그 파일 주석이 그렇게 못박는다)
- 로그인, 회원가입, 비밀번호 재설정 사이를 이동할 때 `redirectTo`를 유지한다
- 회원가입 완료 후 `/login`으로 갈 때도 `redirectTo`를 유지한다
- 비밀번호 재설정에서 로그인으로 돌아갈 때도 `redirectTo`를 유지한다

경로를 잇는 구현은 [`apps/web/lib/redirect.ts`](../apps/web/lib/redirect.ts)의
`buildPathWithRedirect`입니다.

이 규칙은 공개 인증 화면에서 `/home`으로 잘못 진입했다가 다시 로그인으로 튕기는 UX를 막기 위한 것입니다.

## 테스트 기준

비인증 E2E는 보호 라우트 접근 시 로그인으로 리다이렉트되는지를 우선 검증해야 합니다.
보호된 전체 기능 흐름 E2E는 인증된 테스트 컨텍스트나 별도 인증 헬퍼가 필요합니다.

`NEXT_PUBLIC_DEV_AUTH_BYPASS`는 손으로 확인하지 않아도 됩니다 — `playwright.config.ts`의
`webServer.env`가 `"0"`을 박고, 이미 떠 있는 서버를 재사용하는 경우는
`tests/e2e/globalSetup.ts`가 우회가 켜져 있는지 검사해 그 원인을 명시적으로 알려 줍니다.
