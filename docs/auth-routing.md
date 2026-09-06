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
   여기서만 게스트 쿠키를 걷고, 그것도 **인증 쿠키가 함께 있을 때만** 걷는다(아래 절 참고)
2. 보호 경로가 아니면 그대로 통과
3. 인증 쿠키(`accessToken` 또는 `refreshToken`)가 있으면 통과 —
   **게스트 쿠키는 건드리지 않는다**(아래 절 참고)
4. 게스트 쿠키만 있으면 `isGuestAllowedPath(pathname)`로 가른다
   ([`apps/web/lib/protectedPaths.ts`](../apps/web/lib/protectedPaths.ts) — 상수 둘도 여기 있다)
   - `GUEST_MEMBER_ONLY_PREFIXES`(`/shoot/upload`)에 걸리면 **먼저 막는다**
   - 남은 것 중 `GUEST_ALLOWED_PREFIXES`(`/shoot`)로 시작하면 통과 —
     비회원에게 여는 범위는 "찍고 그 사진을 받는 것"까지다
   - 그 외 보호 경로: `/shoot?guestNotice=restricted`로 리다이렉트
5. **쿠키가 하나도 없어도 행사 QR 진입(`/shoot` + `event` 쿼리)이면 통과** —
   응답에 게스트 쿠키를 심어 준다(아래 절 참고)
6. 그 외에는 `/login?redirectTo=...`

```text
/oauth2/callback + 인증 쿠키 O + 게스트 쿠키 O  -> 통과 (게스트 쿠키 삭제)
/oauth2/callback + 인증 쿠키 X                  -> 통과 (게스트 쿠키 그대로)
인증 쿠키 O (그 밖의 보호 경로)                 -> 통과 (게스트 쿠키 그대로)
게스트 쿠키 O + /shoot/upload                   -> /shoot?guestNotice=restricted   ← 회원 전용
게스트 쿠키 O + 그 밖의 /shoot/*                -> 통과
게스트 쿠키 O + 그 외 보호 경로                 -> /shoot?guestNotice=restricted
쿠키 없음 + /shoot?...&event=...                -> 통과 (게스트 쿠키를 심는다)
쿠키 없음                                       -> /login?redirectTo=<원래 경로와 쿼리>
```

### 게스트 쿠키는 소셜 콜백에서만 걷는다

예전에는 **보호 경로에서 인증 쿠키만 보이면** 게스트 쿠키를 지웠습니다. 지금은 그러지
않습니다 — 지우는 자리는 소셜 로그인 콜백 하나뿐입니다.

프록시가 볼 수 있는 것은 쿠키가 **있는지**뿐입니다. 값이 유효한지는 백엔드에 물어야 알 수
있고 미들웨어는 묻지 않으므로, 만료됐거나 서버가 이미 회수한 토큰도 "로그인"으로 읽습니다.
그 상태에서 지우면, 죽은 쿠키를 든 방문자가 "가입 없이 찍어보기"로 방금 심은 게스트 쿠키를
**다음 요청에서 도로 잃습니다.** 그 화면은 메모리 값으로 버티지만, 새로고침 한 번이면
`hydrateGuestMode`([`guestTrialStore.ts`](../apps/web/lib/guestTrialStore.ts))가 쿠키를 못
찾아 회원으로 되돌아가고, 촬영 화면이 인증 API에서 401을 받아 "로그인이 풀렸어요"로
끝납니다. 몇 번을 눌러도 체험이 시작되지 않습니다.

콜백이 그 자리인 이유는, 백엔드가 소셜 인가를 마치고 **인증 쿠키를 심은 뒤** 그 주소로
돌려보내기 때문입니다([`docs/mobile-shell.md`](./mobile-shell.md) 「소셜 로그인」 절의
"지금 흐름 (실측)" — `CustomOAuth2SuccessHandler` 가 `Set-Cookie` 를 붙여 302 로 보냅니다).
거기 인증 쿠키가 있다는 것은 방금 로그인했다는 뜻입니다. 그래서 **게스트 쿠키와 인증 쿠키가
둘 다 있을 때만** 걷습니다 — 인가에 실패해 빈손으로 돌아온 사람에게서 체험까지 뺏을 이유는
없습니다.

콜백 페이지는 성공하면 `window.location.href`로 문서를 새로 받아 zustand에 남은 게스트
상태를 비우지만, **쿠키는 문서를 새로 받아도 살아남습니다.** 그대로 두면 체험하다 가입한
사람이 로그인을 마친 뒤에도 계속 비회원으로 읽혀 자기 프레임과 기록을 못 봅니다.
이메일 로그인은 같은 일을 클라이언트에서 합니다 —
[`apps/web/app/login/page.tsx`](../apps/web/app/login/page.tsx)의 `exitGuestMode()`.

회귀 고정: [`apps/web/proxy.test.ts`](../apps/web/proxy.test.ts)의 「proxy 회원 전환」
세 가지 — "인증 쿠키가 남아 있어도 비회원 체험 쿠키를 지우지 않는다",
"소셜 로그인 콜백에서는 체험 쿠키를 걷는다", "콜백에 빈손으로 돌아왔으면 체험을 그대로 둔다".

### `/shoot/upload`는 `/shoot` 아래지만 회원 전용이다

갤러리 불러오기는 원래 `/upload`(회원 전용)였다. 촬영 흐름으로 합치면서 `/shoot/upload`로
옮겨 왔는데, `/shoot` 접두사 허용이 **비회원에게도 딸려 열어 버렸다.** 그래서
`GUEST_MEMBER_ONLY_PREFIXES`가 따로 있고, 판정에서 허용보다 **먼저** 걸린다.

범위를 정하는 곳과 집행하는 곳이 다르다. 약관 제8조와 `@harucut/shared`의
`GUEST_ALLOWED_ITEMS`가 비회원 범위를 "사진 촬영과 이미지 저장"으로 못박고,
`protectedPaths.ts`가 그것을 경로로 집행한다. 코드가 약관보다 넓으면 화면이 거짓말을 한다.

경계는 접두사가 아니라 세그먼트로 본다(`hasPrefix`) — `/shoot/uploads`는 막히지 않는다.

회귀 고정: [`apps/web/lib/routeContracts.test.ts`](../apps/web/lib/routeContracts.test.ts)의
"갤러리 불러오기는 회원만" / "이름이 비슷한 다른 경로까지 막지는 않는다",
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

이 규칙을 다시 구현하려는 사람에게: 정규화 자체를 고정하는 테스트는 **아직 없다**.
`routeContracts.test.ts`가 잡는 것은 `/shoot/upload`와 `/shoot/uploads` 경계까지다.

### 행사 QR 진입 (쿠키 없는 통과)

행사장에서 QR을 찍은 참가자는 **쿠키가 하나도 없는 새 브라우저**로 도착합니다.
이 예외가 없으면 미들웨어가 `/login`으로 먼저 돌려보내서, "가입 없이 바로 찍는다"는
행사 흐름이 정작 행사장에서만 동작하지 않습니다.

- 판정 조건: 경로가 정확히 `/shoot`이고 `event` 쿼리
  (`EVENT_ENTRY_QUERY`, [`apps/web/lib/guestTrialShared.ts`](../apps/web/lib/guestTrialShared.ts))에
  공백이 아닌 값이 있을 것. 하위 단계(`/shoot/capture` 등)는 여기서 심긴 쿠키로 이어집니다.
- 통과할 때 응답에 `harucut_guest_trial=1`을 심습니다. 속성(`path`, `max-age`,
  `SameSite`, https에서 `Secure`)은 클라이언트가 심는 것과 같은 값이어야 하므로
  `GUEST_TRIAL_COOKIE_MAX_AGE`를 공유합니다.
- **권한 관점**: 랜딩의 "가입 없이 찍어보기" 버튼을 누르면 누구나 얻는 것과 같은 자격입니다.
  즉 새로 여는 문이 아니라, 그 버튼을 누를 기회가 없는 사람에게 같은 문을 열어 주는 것입니다.
- 회귀 테스트: `apps/web/tests/e2e/guards.spec.ts`의
  "lets an event QR visitor shoot without signing up".

이 예외를 지우면 행사(B2B) 흐름이 통째로 죽습니다. 인증 분기를 정리할 때 함께 확인해 주세요.

관련 파일:

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
