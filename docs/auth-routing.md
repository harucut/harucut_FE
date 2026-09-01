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

보호 라우트:

- `/home`
- `/shoot/*`
- `/theme/*`
- `/history`
- `/mypage`

미들웨어 진입점은 [`apps/web/proxy.ts`](../apps/web/proxy.ts)이고,
보호 경로 판정은 [`apps/web/lib/protectedPaths.ts`](../apps/web/lib/protectedPaths.ts)의
`PROTECTED_PATHS`에 있습니다. 검색 노출 대상 공개 페이지는
[`apps/web/app/sitemap.ts`](../apps/web/app/sitemap.ts)와 일치시킵니다
(인증 페이지는 noindex라 sitemap에서 제외).

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
1. 보호 경로가 아니면 그대로 통과
2. 인증 쿠키(`accessToken` 또는 `refreshToken`)가 있으면 통과 —
   이때 게스트 쿠키가 남아 있으면 응답에서 삭제한다(회원 전환)
3. 게스트 쿠키만 있으면
   - `/shoot`로 시작하는 경로(`GUEST_ALLOWED_PREFIXES`): 통과 —
     비회원에게 여는 범위는 "찍고 그 사진을 받는 것"까지다
   - 그 외 보호 경로: `/shoot?guestNotice=restricted`로 리다이렉트
4. **쿠키가 하나도 없어도 행사 QR 진입(`/shoot` + `event` 쿼리)이면 통과** —
   응답에 게스트 쿠키를 심어 준다(아래 절 참고)
5. 그 외에는 `/login?redirectTo=...`

```text
인증 쿠키 O                        -> 통과 (게스트 쿠키 삭제)
게스트 쿠키 O + /shoot/*           -> 통과
게스트 쿠키 O + 그 외 보호 경로    -> /shoot?guestNotice=restricted
쿠키 없음 + /shoot?...&event=...   -> 통과 (게스트 쿠키를 심는다)
쿠키 없음                          -> /login?redirectTo=<원래 경로와 쿼리>
```

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
  -> persistSocialLoginRedirect(redirectTo)
  -> window.location.href = `${NEXT_PUBLIC_BASE_URL}/oauth2/authorization/{kakao|naver|google}`
```

복귀 경로 보존([`apps/web/lib/socialLoginRedirect.ts`](../apps/web/lib/socialLoginRedirect.ts)):

- OAuth는 전체 페이지 리다이렉트라 메모리 상태가 날아갑니다.
  `persistSocialLoginRedirect`가 `getSafeRedirectPath`로 검증한 경로만
  sessionStorage(`social-login-redirect`)에 저장합니다.
- 콜백에서 `consumeSocialLoginRedirect`가 한 번 읽고 즉시 지웁니다.

콜백 처리([`apps/web/app/oauth2/callback/page.tsx`](../apps/web/app/oauth2/callback/page.tsx)):

1. `/api/auth/status`로 계정 상태를 조회한다(`userStatus` / `accountStatus` / `status` 중 먼저 잡히는 값)
2. `UserStatus`별 분기
   - `ACTIVE`: 복귀 경로(없으면 `/home`)로 이동
   - `DELETED_REQUESTED`: 재등록 여부를 확인한다. 수락하면 `reactivateAccount()`
     후 복귀, 거절하거나 실패하면 로그아웃하고 `/login`
   - `BLOCKED` / `DELETED`: 별도 화면 분기 없이 상태 값만 인식한다.
     접근 차단은 서버 응답(권한 오류)에 따른 공통 에러 처리로 흡수된다
3. 상태 조회 자체가 실패하면 로그아웃 후 `/login`

## DEV_AUTH_BYPASS (로컬 전용)

[`apps/web/lib/devAuthBypass.ts`](../apps/web/lib/devAuthBypass.ts)의 스위치입니다.

```text
DEV_AUTH_BYPASS = NODE_ENV !== "production" && NEXT_PUBLIC_DEV_AUTH_BYPASS === "1"
```

- 이중 잠금이라 `.env`에 값이 딸려가도 프로덕션 빌드에서는 항상 `false`입니다.
- 켜면 **이 문서의 보호 계약이 전부 꺼집니다.** 미들웨어는 보호 경로 판정 전에
  `NextResponse.next()`로 빠지고, `SessionExpiryBridge`의 401 → `/login` 이동도
  멈춥니다. 게스트 체험 분기도 타지 않습니다.
- 그래서 E2E는 반드시 끈 상태로 실행합니다. 켜진 채로 돌리면 "비인증 접근 시
  로그인 리다이렉트" 시나리오가 통과하지 않고 조용히 깨집니다.

## 인증 페이지 내 이동 규칙

인증 페이지는 앱 내부 페이지와 다르게 동작하도록 정리되어 있습니다.

- 좌상단 브랜드 링크는 `/`로 이동한다
- 로그인, 회원가입, 비밀번호 재설정 사이를 이동할 때 `redirectTo`를 유지한다
- 회원가입 완료 후 `/login`으로 갈 때도 `redirectTo`를 유지한다
- 비밀번호 재설정에서 로그인으로 돌아갈 때도 `redirectTo`를 유지한다

이 규칙은 공개 인증 화면에서 `/home`으로 잘못 진입했다가 다시 로그인으로 튕기는 UX를 막기 위한 것입니다.

## 헤더 계약

[`apps/web/components/layout/PageHeader.tsx`](../apps/web/components/layout/PageHeader.tsx)는 다음 역할을 분리합니다.

- `brandHref`: 좌상단 브랜드 링크 목적지
- `rightHref`: 우측 아이콘 링크 목적지
- `backHref` + `backLabel`: 텍스트형 뒤로 가기 링크

우측 요소가 이미 버튼이라면 `rightSlot`만 넘기고 `rightHref`는 주지 않습니다.
`backHref`를 우측 아이콘 링크 용도로 재사용하지 않습니다.

## 테스트 기준

비인증 E2E는 보호 라우트 접근 시 로그인으로 리다이렉트되는지를 우선 검증해야 합니다.
보호된 전체 기능 흐름 E2E는 인증된 테스트 컨텍스트나 별도 인증 헬퍼가 필요합니다.
E2E 실행 전에 `NEXT_PUBLIC_DEV_AUTH_BYPASS`가 꺼져 있는지 확인합니다.
