# Harucut Frontend Workspace

Harucut 프론트엔드 워크스페이스.

- 웹 앱: `apps/web`
- 모바일 앱: `apps/mobile`
- 루트: 공통 문서, 워크스페이스 검증 스크립트, GitHub 설정

## 구조

- `apps/web`: Next.js App Router 기반 웹 앱
- `apps/mobile`: Expo Router 기반 iOS/Android 앱
- `packages/shared`: 웹·앱 공용 모듈 `@harucut/shared` (`auth-validation.ts`, `fourcut-filters.ts`, `legal.ts`)
- `docs/`: 서비스 흐름, 인증 라우팅, 모바일 설계, QA 체크리스트, ADR
- `scripts/`: 검증 스크립트
- `.github/`: 워크플로와 저장소 자동화 설정

## 시작

```powershell
pnpm install
```

웹 개발 서버:

```powershell
pnpm dev:web
```

모바일 개발 서버:

```powershell
pnpm dev:mobile
```

## 주요 스크립트

- `pnpm dev:web`
- `pnpm build:web`
- `pnpm test:web`
- `pnpm lint:mobile`
- `pnpm typecheck:mobile`
- `pnpm verify:web`
- `pnpm verify:mobile`
- `pnpm verify:standard`

## 라우트 개요

공개 라우트

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/features`
- `/faq`
- `/pricing`
- `/privacy`
- `/terms`
- `/oauth2/callback`

보호 라우트

- `/home`
- `/shoot/*`
- `/theme/*`
- `/history`
- `/mypage`

보호 라우트는 [apps/web/proxy.ts](./apps/web/proxy.ts)에서 처리하고, 경로 목록은
[apps/web/lib/protectedPaths.ts](./apps/web/lib/protectedPaths.ts)에 있다.  
비인증 상태에서 접근하면 `/login?redirectTo=<원래 경로>`로 이동한다. (게스트 체험 예외는 [docs/auth-routing.md](./docs/auth-routing.md) 참조)

## 문서

**[docs/README.md](./docs/README.md) 부터 본다** — 문서 지도와 *이미 확인이 끝난 사실*이
거기 모여 있다(계약 대조 결과, 앱에서 정상이라 손대지 않은 것, 백엔드 대기 중인 것).
같은 것을 다시 조사하기 전에 먼저 열 것.

- 라우트 플로우: [docs/route-flows.md](./docs/route-flows.md)
- 인증 및 리다이렉트: [docs/auth-routing.md](./docs/auth-routing.md)
- 앱이 왜 웹뷰 셸인가: [docs/adr/ADR-0003-앱을-웹뷰-셸로.md](./docs/adr/ADR-0003-앱을-웹뷰-셸로.md)
- 백엔드 계약 실측: [docs/backend-contract.md](./docs/backend-contract.md)
- 로컬 백엔드 실행: [docs/local-backend.md](./docs/local-backend.md)
- 앱 웹뷰 셸: [docs/mobile-shell.md](./docs/mobile-shell.md)
- 백엔드에 요청할 것: [docs/app-shell-backend-requests.md](./docs/app-shell-backend-requests.md)
- 작업 규칙: [AGENTS.md](./AGENTS.md)
- 기여 가이드: [CONTRIBUTING.md](./CONTRIBUTING.md)

## 브랜치 정책

- 시작 브랜치: `develop`
- 작업 브랜치: `issue/<number>-<slug>`
- 승격 경로: `develop -> main`
- `main`, `develop` 직접 commit/push 금지
