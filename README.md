# Harucut Frontend Workspace

하루컷 프론트엔드 워크스페이스입니다.

- 웹 앱: `apps/web`
- 모바일 앱: `apps/mobile`
- 루트: Ralph loop, GitHub 보호 규칙, 공통 문서, 워크스페이스 실행 스크립트

## 구조

- `apps/web`: 기존 Next.js App Router 웹 앱
- `apps/mobile`: Expo Router 기반 iOS/Android 앱
- `docs/`: 서비스 흐름, 인증 라우팅, 모바일 설계, ADR
- `scripts/`: Ralph loop, Discord bridge, 검증 스크립트
- `.github/`: 보안, 템플릿, 워크플로

## 시작하기

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
- `pnpm verify:automation`
- `pnpm verify:standard`

## 라우트 개요

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

보호 라우트는 [apps/web/proxy.ts](./apps/web/proxy.ts)에서 처리합니다.
비인증 상태에서 접근하면 `/login?redirectTo=<원래 경로>`로 이동합니다.

## 문서

- 라우트 플로우: [docs/route-flows.md](./docs/route-flows.md)
- 인증 및 라우팅: [docs/auth-routing.md](./docs/auth-routing.md)
- 모바일 앱 설계: [docs/mobile-app-blueprint.md](./docs/mobile-app-blueprint.md)
- 작업 규칙: [AGENTS.md](./AGENTS.md)
- 기여 가이드: [CONTRIBUTING.md](./CONTRIBUTING.md)

## 브랜치 정책

- 작업 시작 브랜치: `develop_loop`
- 작업 브랜치: `issue/<number>-<slug>`
- 승격 경로: `develop_loop -> develop -> main`
- `main`, `develop`, `develop_loop` 직접 commit/push 금지
- 이 저장소의 Ralph 자동화는 issue 브랜치 생성과 push까지만 자동화하고, PR 생성은 사용자 지시가 있을 때만 수행합니다.
