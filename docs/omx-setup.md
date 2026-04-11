# OMX 적용 가이드

이 문서는 `Recorday_FE` 저장소에 `oh-my-codex`를 붙여서 실제로 쓰는 기준을 정리합니다.

2026-04-07 기준 현재 상태:

- 이 저장소에서 `omx setup --scope project` 적용 완료
- 기존 [AGENTS.md](../AGENTS.md)는 유지하고 OMX 기본 AGENTS 덮어쓰기는 건너뜀
- 로컬 런타임 파일은 `.omx/`, `.codex/config.toml`, `.codex/hooks.json`에 생성됨
- 프로젝트 전용 OMX 스킬은 `.codex/skills/recorday-workflow/SKILL.md`에 추가됨

## 먼저 결론

OMX는 "자리를 비운 동안 Codex를 더 오래, 더 구조적으로 돌리는 레이어"로 이해하면 됩니다.

- 터미널 세션과 머신이 살아 있으면 계속 일할 수 있습니다.
- `omx ralph`는 한 작업을 끝까지 밀어붙이는 단일 책임 루프에 가깝습니다.
- `omx team`은 여러 워커를 병렬로 돌리는 팀 모드입니다.
- PC가 절전, 최대 절전, 종료되면 작업도 멈춥니다.
- 승인 대기나 로그인/토큰/권한 문제를 만나면 거기서 멈출 수 있습니다.
- "GitHub 이슈 감지 -> PR 생성 -> 리뷰 -> 머지"까지 완전 자동으로 하려면 OMX만으로는 부족하고, GitHub 트리거와 장기 실행 러너, 자격 증명, 브랜치 보호 정책이 같이 필요합니다.

## 이 저장소에서 바로 쓰는 방법

PowerShell 실행 정책 때문에 이 환경에서는 `omx` 대신 `omx.cmd`를 쓰는 편이 안전합니다.
`codex`도 같은 이유로 `codex.cmd`를 권장합니다.

기본 점검:

```powershell
omx.cmd doctor
omx.cmd doctor --team
```

기본 세션 시작:

```powershell
omx.cmd --high
```

한 작업을 끝날 때까지 계속 물고 가게 할 때:

```powershell
omx.cmd ralph "redirectTo 보존 규칙과 보호 라우트 회귀를 점검하고 필요한 수정까지 진행"
```

병렬 워커로 나눠서 시킬 때:

```powershell
omx.cmd team 3:executor "auth redirect, multistep session guard, Playwright 회귀를 병렬로 점검하고 수정"
```

세션 기록 확인:

```powershell
omx.cmd session
```

기록 파일 위치:

- `.omx/logs/`
- `.omx/plans/`
- `.omx/state/`

## 내가 자러 가도 계속 도는가

상황별로 다릅니다.

1. 같은 터미널 창을 켜 둔 채로 PC가 깨어 있으면:
   계속 돕니다.
2. 터미널 창을 닫지만 팀 런타임이 `tmux/psmux` 위에서 살아 있으면:
   재접속해서 이어받을 수 있습니다.
3. 노트북이 절전/최대 절전/종료되면:
   멈춥니다.
4. 승인 프롬프트가 뜨고 사람이 승인하지 않으면:
   거기서 대기합니다.
5. 외부 API 키, GitHub 권한, 테스트용 인증 컨텍스트가 없으면:
   그 단계에서 막힐 수 있습니다.

즉, "내가 없어도 완전히 무인으로 계속"을 원하면 최소한 아래가 필요합니다.

- 머신이 잠들지 않을 것
- `omx ralph` 또는 `omx team`으로 작업 시작
- 승인 대기를 만들지 않는 운영 방식
- 실패/완료 알림 채널

`--madmax`는 승인과 샌드박스를 우회하므로 무인 실행에는 편하지만 위험합니다.
기본 브랜치가 아니라 별도 작업 브랜치나 worktree에서만 쓰는 편이 안전합니다.

## 팀 모드 준비

이 저장소의 OMX 설정은 끝났지만, Windows 팀 모드를 안정적으로 쓰려면 `psmux`를 먼저 넣는 편이 좋습니다.

예시:

```powershell
winget install psmux
omx.cmd doctor --team
```

팀 모드는 보통 이런 경우에 씁니다.

- 한 명은 코드 수정
- 한 명은 테스트/회귀 검증
- 한 명은 문서화나 리뷰

작은 작업은 Codex 기본 서브에이전트로도 충분합니다.
진짜로 오래 돌릴 병렬 작업만 `omx team`으로 넘기는 편이 낫습니다.

## 이 저장소 전용으로 넣어둔 것

프로젝트 전용 OMX 스킬:

- `$recorday-workflow`

이 스킬은 아래 규칙을 다시 상기시키는 용도입니다.

- 보호 라우트 목록
- `/login?redirectTo=...` 규칙
- `redirectTo` 쿼리 보존
- 인증 페이지 브랜드 링크는 `/`
- `PageHeader` prop 계약
- 촬영/업로드/테마 멀티스텝 세션 가드

즉, 라우팅이나 멀티스텝 흐름을 건드릴 때는 이런 식으로 시작하면 됩니다.

```text
$recorday-workflow
redirectTo 보존과 멀티스텝 가드 규칙을 지키면서 /upload/result 진입 회귀를 점검해줘
```

## 추천 운영 방식

### 1. 내가 옆에서 같이 보는 모드

```powershell
omx.cmd --high
```

적합:

- 탐색
- 작은 수정
- 즉시 피드백이 필요한 작업

### 2. 자리 비우기 전 단일 작업 완주 모드

```powershell
omx.cmd ralph "스토리북과 Playwright 기준으로 auth redirect 회귀까지 포함해 끝까지 처리"
```

적합:

- 한 묶음의 버그 수정
- 코드 정리 + 검증
- 끝날 때까지 물고 가야 하는 작업

### 3. 진짜 병렬 작업 모드

```powershell
omx.cmd team 3:executor "라우팅 수정, Jest 검증, Playwright 검증을 분리해서 처리"
```

적합:

- 서로 독립적인 수정이 여러 개 있을 때
- 리뷰/검증 lane을 따로 둘 때
- worktree 기반으로 충돌을 줄이고 싶을 때

## PR 생성, 리뷰, 머지까지 자동화하려면

여기서부터는 OMX 단독이 아니라 운영 파이프라인 문제입니다.

필요한 것:

1. GitHub 이벤트를 받는 트리거
2. 장기 실행되는 러너 또는 서버
3. `git`, `gh`, GitHub 토큰, 리뷰/머지 권한
4. 테스트와 브랜치 보호 규칙
5. 실패/승인/완료 알림

권장 구조:

1. GitHub Issue 또는 `workflow_dispatch`로 작업 시작
2. 러너에서 `omx exec` 또는 `omx team` 실행
3. 작업 결과를 브랜치/PR로 올림
4. 별도 리뷰 lane 또는 보호 규칙 통과 후 머지

`ClawHip`이나 OpenClaw 계열은 이런 이벤트 라우팅과 알림 계층에 가깝습니다.
즉, OMX 위에 얹는 운영 레이어로 보면 됩니다.

## 알림을 붙이고 싶다면

OMX는 임시 알림 라우팅 옵션을 제공합니다.

예시:

```powershell
omx.cmd --notify-temp --telegram --high
omx.cmd --notify-temp --discord ralph "테스트 실패 원인 찾아서 수정"
```

실서비스 수준으로 붙이려면 Telegram bot token, Discord webhook, Slack webhook, 또는 OpenClaw 게이트웨이 설정이 추가로 필요합니다.
이 저장소에는 아직 그 비밀값을 넣지 않았습니다.

## 주의할 점

- 이 저장소의 보호 라우트와 세션 가드는 URL만으로 복구되지 않는 흐름이 있습니다.
- 그래서 "페이지 하나 고쳤다"가 아니라 "미들웨어 -> 페이지 가드 -> 테스트" 순서로 확인해야 합니다.
- 인증이 필요한 전체 E2E는 별도 인증 컨텍스트가 없으면 완전 자동 검증이 어렵습니다.
- OMX가 세션을 길게 유지해도, 환경 변수나 외부 로그인 상태가 없으면 그 부분은 막힙니다.

## 다음에 바로 해볼 만한 순서

1. `winget install psmux`
2. `omx.cmd doctor --team`
3. `omx.cmd --high`
4. 첫 실전 태스크는 `$recorday-workflow`를 붙여서 작은 라우팅/세션 회귀 하나로 시작
5. 익숙해지면 `omx.cmd ralph ...`
6. 정말 필요한 경우에만 `omx.cmd team ...`
