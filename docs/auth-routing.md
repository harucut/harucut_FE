# 인증 및 리다이렉트 규칙

## 공개 라우트와 보호 라우트

공개 라우트:

- `/`
- `/login`
- `/signup`
- `/forgot-password`

보호 라우트:

- `/home`
- `/shoot/*`
- `/upload/*`
- `/theme/*`
- `/history`
- `/mypage`

미들웨어 진입점은 [`proxy.ts`](../proxy.ts)입니다.

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

안전한 리다이렉트 파싱은 [`lib/redirect.ts`](../lib/redirect.ts)에 있습니다.

## 인증 페이지 내 이동 규칙

인증 페이지는 앱 내부 페이지와 다르게 동작하도록 정리되어 있습니다.

- 좌상단 브랜드 링크는 `/`로 이동한다
- 로그인, 회원가입, 비밀번호 재설정 사이를 이동할 때 `redirectTo`를 유지한다
- 회원가입 완료 후 `/login`으로 갈 때도 `redirectTo`를 유지한다
- 비밀번호 재설정에서 로그인으로 돌아갈 때도 `redirectTo`를 유지한다

이 규칙은 공개 인증 화면에서 `/home`으로 잘못 진입했다가 다시 로그인으로 튕기는 UX를 막기 위한 것입니다.

## 헤더 계약

[`components/layout/PageHeader.tsx`](../components/layout/PageHeader.tsx)는 다음 역할을 분리합니다.

- `brandHref`: 좌상단 브랜드 링크 목적지
- `rightHref`: 우측 아이콘 링크 목적지
- `backHref` + `backLabel`: 텍스트형 뒤로 가기 링크

우측 요소가 이미 버튼이라면 `rightSlot`만 넘기고 `rightHref`는 주지 않습니다.
`backHref`를 우측 아이콘 링크 용도로 재사용하지 않습니다.

## 테스트 기준

비인증 E2E는 보호 라우트 접근 시 로그인으로 리다이렉트되는지를 우선 검증해야 합니다.
보호된 전체 기능 흐름 E2E는 인증된 테스트 컨텍스트나 별도 인증 헬퍼가 필요합니다.
