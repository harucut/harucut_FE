# 기여 가이드

`harucut_FE`는 공개 저장소이지만 브랜치 보호와 릴리스 규칙이 강하게 적용됩니다.

## 어디에 남겨야 하는가

- 질문, 아이디어, 방향 논의: GitHub Discussions
- 실제 작업 제안과 구현 범위: GitHub Issue
- 보안 취약점 제보: [.github/SECURITY.md](.github/SECURITY.md)

## 브랜치 전략

- 작업 시작 브랜치: `develop_loop`
- 작업 브랜치: `issue/<number>-<slug>`
- 검증 브랜치: `develop`
- 릴리스 브랜치: `main`

## 강제 규칙

- `main`, `develop`, `develop_loop` 직접 commit 금지
- `main`, `develop`, `develop_loop` 직접 push 금지
- `develop` 머지는 코드오너 승인 1회 필요
- `main`은 `develop -> main` PR만 허용
- `main` PR 작성자는 `alpaka206`만 허용
- 장수 브랜치 승격(`develop_loop -> develop`, `develop -> main`)은 `merge`
- 이슈 브랜치에서 `develop_loop`로 들어가는 PR도 `merge`
- Harucut Ralph 자동화는 issue 브랜치 push까지만 자동화하고 PR은 자동 생성하지 않음

## 제목 규칙

이슈와 PR 제목은 아래 접두어 중 하나로 시작합니다.

- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `chore:`
- `ci:`
- `test:`
- `perf:`

`자동 생성`, `auto-generated` 같은 일반 제목은 금지합니다.

## 검증

기본 검증:

```powershell
pnpm verify:standard
pnpm verify:automation
```

상황별 검증:

```powershell
pnpm test:web
pnpm build:web
pnpm lint:mobile
pnpm typecheck:mobile
```

## 문서

- 설계와 운영 문서 원본: `docs/`
- 외부 공개용 정리 문서: GitHub Wiki
