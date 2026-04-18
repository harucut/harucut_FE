# 기여 가이드

`harucut_FE` 저장소는 공개 협업을 허용하지만 브랜치 보호와 릴리스 규칙은 강하게 유지합니다.

## 어디에 남겨야 하는가

- 질문, 아이디어, 방향 논의: GitHub Discussions
- 실제 작업 제안: GitHub Issue
- 보안 취약점: 공개 이슈 대신 [보안 정책](.github/SECURITY.md) 사용

## 브랜치 흐름

- 작업 기준 브랜치: `develop_loop`
- 작업 브랜치: `issue/<number>-<slug>`
- 검토 브랜치: `develop`
- 릴리스 브랜치: `main`

## 강제 규칙

- `main`, `develop`, `develop_loop`에는 직접 커밋하지 않습니다.
- `main`, `develop`, `develop_loop`에는 직접 push하지 않습니다.
- `develop`으로 들어가는 PR은 사용자 확인과 코드 오너 승인이 필요합니다.
- `main`은 `develop -> main` PR만 허용합니다.
- `main` 대상 PR 작성자는 `alpaka206`만 허용합니다.
- 장수 브랜치 승격(`develop_loop -> develop`, `develop -> main`)은 `merge` 전략으로 조상 관계를 보존합니다.
- 이슈 브랜치에서 `develop_loop`로 들어가는 PR만 `squash`를 사용합니다.
- 현재 Harucut Ralph 자동화는 issue 브랜치와 push까지만 처리하고 PR은 사용자 지시가 있을 때만 엽니다.

## 제목 규칙

이슈와 PR 제목은 작업 성격이 바로 보이도록 아래 접두어를 사용합니다.

- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `chore:`
- `ci:`
- `test:`
- `perf:`

`auto-generated`, `자동 생성`처럼 의미 없는 제목은 사용하지 않습니다.

## 검증

기본 검증

```powershell
pnpm verify:standard
pnpm verify:automation
```

상황별 추가 검증

```powershell
pnpm lint:web
pnpm lint:mobile
pnpm typecheck:mobile
```

## 문서

- 설계와 운영 문서 원본: `docs/`
- 외부 공개용 정리 문서: GitHub Wiki
