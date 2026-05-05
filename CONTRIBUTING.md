# 기여 가이드

`harucut_FE`는 공개 저장소지만 브랜치 보호와 릴리즈 규칙이 강하게 적용된다.

## 어디에 올리면 되는가

- 질문, 아이디어, 방향 논의: GitHub Discussions
- 실제 작업 제안과 구현 범위: GitHub Issue
- 보안 제보: [.github/SECURITY.md](.github/SECURITY.md)

## 브랜치 정책

- 시작 브랜치: `develop`
- 작업 브랜치: `issue/<number>-<slug>`
- 검증 브랜치: `develop`
- 릴리즈 브랜치: `main`

## 강제 규칙

- `main`, `develop` 직접 commit 금지
- `main`, `develop` 직접 push 금지
- `develop` 머지는 write 권한 리뷰 승인 1개 이상 필요
- `main`에는 `develop -> main` PR만 허용
- 승격 브랜치 PR은 `merge` 방식 사용
- 개인 작업 브랜치는 `develop` 기준으로 생성

## 제목 규칙

이슈와 PR 제목은 아래 접두어 중 하나로 시작한다.

- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `chore:`
- `ci:`
- `test:`
- `perf:`

`자동 생성`, `auto-generated` 같은 일반 제목은 금지.

## 검증

기본 검증

```powershell
pnpm verify:standard
```

상황별 검증

```powershell
pnpm test:web
pnpm build:web
pnpm lint:mobile
pnpm typecheck:mobile
```

## 문서

- 설계와 운영 문서 모음: `docs/`
- 공개 정리 문서: GitHub Wiki
