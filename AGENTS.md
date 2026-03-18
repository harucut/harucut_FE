# AGENTS.md

## 저장소 구조

- 단일 패키지 Next.js App Router 앱입니다.
- 주요 디렉터리:
  - `app/`: 라우트와 라우트 핸들러
  - `components/`: 재사용 UI
  - `lib/`: 상태 저장소, API, 인증, 캔버스 로직
  - `tests/e2e/`: Playwright E2E

## 핵심 불변 조건

- `/home`, `/shoot/*`, `/upload/*`, `/theme/*`, `/history`, `/mypage`는 보호 라우트입니다.
- 비인증 접근은 `/login?redirectTo=...`로 리다이렉트됩니다.
- `redirectTo`는 원래 쿼리스트링까지 보존해야 합니다.
- 인증 페이지의 브랜드 링크는 `/home`이 아니라 `/`를 사용합니다.

## 멀티스텝 상태 관리

- `lib/shootSessionStore.ts`는 촬영 흐름을 담당합니다.
- `lib/uploadSessionStore.ts`는 업로드 흐름을 담당합니다.
- `lib/themeSessionStore.ts`는 테마 진입 흐름을 담당합니다.
- `lib/themeEditorStore.ts`는 실제 테마 편집기를 담당합니다.

이 흐름들은 기본적으로 URL만으로 복구되지 않습니다.
뒤 단계 페이지는 필요한 세션 상태가 없을 때 가장 이른 유효 단계로 복귀시켜야 합니다.

## 헤더 사용 규칙

`PageHeader`는 다음처럼 사용합니다.

- `brandHref`: 좌상단 브랜드 링크
- `rightHref`: `/home -> /mypage` 같은 우측 아이콘 링크
- `rightSlot`만 사용: 새로고침처럼 실제 버튼을 직접 넣을 때
- `backHref` + `backLabel`: 텍스트형 뒤로 가기 링크

## 인증 라우팅 규칙

- 안전한 리다이렉트 파싱은 `lib/redirect.ts`에 둡니다.
- `/login`, `/signup`, `/forgot-password` 사이 이동 시 `redirectTo`를 유지합니다.
- 로그인 완료 후에는 새 쿠키가 안정적으로 적용되도록 최종 목적지로 전체 이동을 우선합니다.

## 테스트 가이드

- 공개 라우트와 리다이렉트 규칙은 Playwright로 검증할 수 있습니다.
- 보호된 전체 흐름 E2E는 인증된 테스트 컨텍스트가 필요합니다.
- 라우트 테스트는 먼저 미들웨어 보호 동작, 그 다음 페이지 내부 세션 가드를 기준으로 맞춥니다.

## 참고 문서

- `README.md`
- `docs/route-flows.md`
- `docs/auth-routing.md`
