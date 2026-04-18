# AGENTS.md

## 저장소 구조

- `apps/web`: 기존 Next.js App Router 웹 앱
- `apps/mobile`: Expo Router 기반 iOS/Android 앱
- `docs/`: 서비스 흐름, 인증 라우팅, 모바일 설계, ADR
- `scripts/`: Ralph loop, Discord bridge, 검증 스크립트

웹 관련 코드는 `apps/web` 안에서만 수정합니다.
루트는 워크스페이스 실행과 운영 규칙만 담당합니다.

## 브랜치 규칙

- 기준 브랜치: `develop_loop`
- 작업 브랜치: `issue/<number>-<slug>`
- `main`, `develop`, `develop_loop`에는 직접 commit/push하지 않습니다.
- 이 저장소의 Ralph 자동화는 issue 브랜치 생성, 커밋, push까지만 수행하고 PR은 자동 생성하지 않습니다.
- 이슈와 PR 제목은 `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`, `test:`, `perf:` 중 하나로 시작합니다.
- `자동 생성`, `auto-generated` 같은 일반 제목은 금지합니다.

## 보호 라우트

- `/home`
- `/shoot/*`
- `/upload/*`
- `/theme/*`
- `/history`
- `/mypage`

보호 라우트 로직은 `apps/web/proxy.ts`에 있습니다.
비인증 접근은 `/login?redirectTo=...`로 보냅니다.

## 상태 저장소

- `apps/web/lib/shootSessionStore.ts`
- `apps/web/lib/uploadSessionStore.ts`
- `apps/web/lib/themeSessionStore.ts`
- `apps/web/lib/themeEditorStore.ts`

각 페이지는 필요한 상태가 없으면 유효한 이전 단계로 되돌립니다.

## 테스트 가이드

- 웹 검증: `pnpm test:web`, `pnpm build:web`
- 모바일 검증: `pnpm lint:mobile`, `pnpm typecheck:mobile`
- 통합 검증: `pnpm verify:standard`, `pnpm verify:automation`

## 참고 문서

- `README.md`
- `docs/route-flows.md`
- `docs/auth-routing.md`
- `docs/mobile-app-blueprint.md`
- `.ralph-loop.yml`
