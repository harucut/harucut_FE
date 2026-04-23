---
name: ralph-discord-loop
description: Harucut 저장소를 Ralph 스타일 자율 루프로 운영한다. Discord 원격 제어, 보호 브랜치 안전장치, issue 브랜치 흐름, 결제/인증정보/외부 계정/프로덕션 배포/비가역 작업에서만 사용자 확인을 포함한다.
---

# Ralph Discord Loop

## Source Of Truth

항상 `../../../.ralph-loop.yml`을 먼저 읽는다.

그 다음 현재 상태를 아래 파일로 확인한다.

- `../../../.omx/state/STATE.md`
- `../../../.omx/state/VERIFY_LAST_FAILURE.md`
- `../../../.omx/state/GITHUB_AUTOMATION_STATUS.md`
- `../../../.omx/runtime/omx-loop-status.json`
- `../../../.omx/state/RALPH_CONTROL_STATE.json`

## Core Behavior

1. `.ralph-loop.yml`에서 현재 목표와 `minimum_done` 조건을 이해한다.
2. `ask_user_only_when`에 걸리지 않는 작업은 자율적으로 계속 진행한다.
3. 계획, 리뷰, 테스트, git 흐름은 내부 Codex subagent 조율을 우선한다.
4. Discord를 agent-agent 메인 버스로 쓰지 않는다.
5. Discord는 시작/종료 보고, 원격 제어, 반복 실패 경고, 필수 승인 요청에만 사용한다.

## Harucut Mobile Rule

- `apps/web`는 읽기 전용이다.
- `apps/web` 아래 파일은 절대 수정하지 않는다.
- 실제 구현과 수정은 `apps/mobile` 중심으로만 한다.
- 웹은 기준선 검증용으로만 읽는다.
- 디자인과 사용성은 직접 확인해야 한다.
- API 통신과 에러 처리도 직접 확인해야 한다.
- 직접 확인하지 않은 기능을 완료라고 보고하지 않는다.

## User Escalation Policy

사용자에게 묻는 경우는 아래뿐이다.

- 유료 서비스나 결제가 필요할 때
- API key, secret, token, credential이 필요할 때
- 외부 계정 접근이 필요할 때
- 프로덕션 배포가 필요할 때
- 비가역 DB/데이터 작업이 필요할 때

일반적인 기술 선택은 묻지 않는다.

## Git Policy

- `main`, `develop`, `develop_loop`에는 직접 commit하지 않는다.
- `main`, `develop`, `develop_loop`에는 직접 push하지 않는다.
- 항상 `develop_loop`에서 작업을 시작한다.
- 브랜치 이름은 `issue/<number>-<slug>`를 사용한다.
- issue 브랜치는 `develop_loop` 기준으로 만들고 원격까지 push한다.
- PR은 사용자 지시가 있을 때만 만든다.

## Writing

- 진행 요약, Discord 메시지, PR 설명, 상태 보고는 모두 한국어로 작성한다.
- 짧고 분명하게 쓴다.
- 검증을 안 했으면 안 했다고 쓴다.

## Completion Tokens

- 현재 목표가 충족되면 `RALPH_DONE`을 출력한다.
- 사용자 확인 없이는 진행할 수 없는 상태면 `RALPH_BLOCKED`를 출력한다.
