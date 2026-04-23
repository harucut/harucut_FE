# AGENTS.md

## 저장소 구조

- `apps/web`: 기존 Next.js App Router 웹 앱
- `apps/mobile`: Expo Router 기반 iOS/Android 앱
- `docs/`: 서비스 흐름, 인증 라우팅, 모바일 설계, QA 체크리스트, ADR
- `scripts/`: Ralph loop, Discord bridge, 검증 스크립트

현재 모바일 작업 원칙:

- `apps/web`는 읽기 전용이다
- 실제 수정은 `apps/mobile` 중심으로만 한다
- 루트와 문서는 워크스페이스 운영 규칙 정리에만 사용한다

## 브랜치 규칙

- 기준 브랜치: `develop_loop`
- 작업 브랜치: `issue/<number>-<slug>`
- `main`, `develop`, `develop_loop`에는 직접 commit/push하지 않는다
- 이 저장소의 Ralph 자동화는 issue 브랜치 생성, 커밋, push까지만 수행하고 PR은 자동 생성하지 않는다
- 이슈와 PR 제목은 `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`, `test:`, `perf:` 중 하나로 시작한다
- `자동 생성`, `auto-generated` 같은 일반 제목은 금지한다

## 모바일 작업 원칙

- `apps/web`는 절대 수정하지 않는다
- 모바일 변경은 `apps/mobile` 범위 안에서 끝낸다
- 디자인과 사용성은 직접 확인한다
- API 통신과 에러 처리도 직접 확인한다
- 직접 확인하지 않은 기능을 완료라고 쓰지 않는다

## 보호 라우트

- `/home`
- `/shoot/*`
- `/upload/*`
- `/theme/*`
- `/history`
- `/mypage`

보호 라우트 로직은 `apps/web/proxy.ts`에 있다.
비인증 접근은 `/login?redirectTo=...`로 보낸다.

## 테스트 가이드

- 웹 기준선 검증: `pnpm test:web`, `pnpm build:web`
- 모바일 정적 검증: `pnpm lint:mobile`, `pnpm typecheck:mobile`
- 통합 검증: `pnpm verify:standard`, `pnpm verify:automation`
- 모바일 수동/직접 확인: `docs/mobile-qa-checklist.md`

## 참고 문서

- `README.md`
- `docs/route-flows.md`
- `docs/auth-routing.md`
- `docs/mobile-app-blueprint.md`
- `docs/mobile-qa-checklist.md`
- `.ralph-loop.yml`
