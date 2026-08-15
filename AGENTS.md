# AGENTS.md

## 저장소 구조

- `apps/web`: 기존 Next.js App Router 웹 앱
- `apps/mobile`: Expo Router 기반 iOS/Android 앱
- `packages/shared`: 웹·앱 공용 모듈 `@harucut/shared` (`auth-validation.ts`, `fourcut-filters.ts`, `legal.ts`)
- `docs/`: 서비스 흐름, 인증 라우팅, 모바일 설계, QA 체크리스트, ADR
- `scripts/`: 검증 스크립트

현재 작업 원칙:

- `apps/web`와 `apps/mobile` 모두 필요한 범위에서 수정할 수 있다
- 작업 목적에 맞춰 실제 수정 범위를 명확히 한다
- 루트와 문서는 워크스페이스 운영 규칙 정리에 사용한다

## 브랜치 규칙

- 기준 브랜치: `develop`
- 작업 브랜치: `issue/<number>-<slug>`
- `main`, `develop`에는 직접 commit/push하지 않는다
- 이슈와 PR 제목은 `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`, `test:`, `perf:` 중 하나로 시작한다
- `자동 생성`, `auto-generated` 같은 일반 제목은 금지한다

## 앱 작업 원칙

- 웹 변경은 `apps/web`, 모바일 변경은 `apps/mobile` 범위에서 진행한다
- 웹과 모바일 연동이 필요한 작업은 두 앱을 함께 조정할 수 있다
- 디자인과 사용성은 직접 확인한다
- API 통신과 에러 처리도 직접 확인한다
- 직접 확인하지 않은 기능을 완료라고 쓰지 않는다

## 라우트

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
- `/upload/*`
- `/theme/*`
- `/decorate`
- `/history`
- `/mypage`

보호 라우트 로직은 `apps/web/proxy.ts`, 경로 목록은 `apps/web/lib/protectedPaths.ts`에 있다.  
비인증 접근은 `/login?redirectTo=...`로 보낸다. (게스트 체험 예외는 `docs/auth-routing.md` 참조)

## 테스트 가이드

- 웹 기준선 검증: `pnpm test:web`, `pnpm build:web`
- 모바일 정적 검증: `pnpm lint:mobile`, `pnpm typecheck:mobile`
- 통합 검증: `pnpm verify:standard`
- 모바일 수동/직접 확인: `docs/mobile-qa-checklist.md`

### CI 실행 규칙

PR의 `verify`·`e2e` 잡은 **자동으로 돌지 않는다**. `run-ci` 라벨이 붙었을 때만 돈다.

라벨이 붙는 경로는 두 가지다.

- **Codex 리뷰가 끝나면 자동으로** 붙는다(`.github/workflows/ci-on-codex-review.yml`).
  검사 순서가 "Codex 리뷰 → CI"로 고정되고, 리뷰 전 코드에 러너 시간을 쓰지 않는다.
- 직접 붙여도 된다. Actions 탭에서 `verify` 워크플로를 수동 실행해도 된다.

라벨이 한 번 붙으면 이후 푸시도 계속 검사한다. 그만 돌리려면 라벨을 뗀다.
develop 브랜치 푸시는 라벨과 무관하게 항상 검사한다.

라벨이 없으면 두 잡은 skipped로 끝나고, GitHub이 이를 필수 검사 통과로 인정해 병합은 막지 않는다.
그만큼 **라벨을 붙이지 않고 병합하면 CI 검증 없이 들어간다** — 병합 전에 한 번은 라벨을 붙이거나
로컬에서 `pnpm verify:standard`를 돌린다.

## 참고 문서

- `README.md`
- `docs/route-flows.md`
- `docs/auth-routing.md`
- `docs/mobile-app-blueprint.md`
- `docs/mobile-qa-checklist.md`

## 응답 규칙

- 기본 응답 언어는 한국어
- 별도 요청이 없으면 이슈, PR, 커밋, 설명 문구도 한국어 우선
- 서술형보다 정리형 표현 우선
- `...합니다`, `...했습니다`보다 `... 정리`, `... 조정`, `... 제거` 톤 우선
- 짧고 직접적인 문장 우선
