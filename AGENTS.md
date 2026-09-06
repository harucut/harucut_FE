# AGENTS.md

이 저장소의 규칙 원본. Codex 는 이 파일을 읽고, Claude Code 는 `CLAUDE.md` 를 읽는다.
`CLAUDE.md` 는 이 파일을 가리키는 얇은 진입점이다 — **규칙을 고칠 때는 여기를 고친다.**

## 아키텍처 — 앱은 웹뷰 셸이다

**앱은 자기 화면을 그리지 않는다.** 웹을 WebView 로 띄우고, 웹이 못 하는 것만 네이티브가
맡는다. ADR-0003(2026-08-18 채택)이 `screens/` 6,299줄 + 11,534줄을 셸·브리지 약 400줄로
바꿨다.

- `apps/mobile` 의 소스는 5개 파일이다 — `app/_layout.tsx`, `app/index.tsx`,
  `components/harucut-web-shell.tsx`, `lib/native-bridge.ts`, `constants/shell.ts`.
  라우트는 1개다. 마지막 파일은 **어느 오리진이 브리지를 부를 수 있는지**를 쥔다 —
  브리지의 문이라 목록에서 빠뜨리면 보안 경계 변경을 놓친다.
- **그래서 "모바일 화면을 고쳐라"의 정답은 거의 항상 `apps/web` 이다.**
- 네이티브가 맡는 것은 일곱 가지다: 사진첩 저장 · 공유 시트 · 햅틱 · **알림** ·
  **상태바 색** · **안전영역** · 하드웨어 뒤로가기. **이 목록의 소유자는
  [`docs/mobile-shell.md`](docs/mobile-shell.md) 「네이티브가 맡는 것과 그 이유」 표다** —
  ADR-0003 「경계선」은 2026-08-18 에 이렇게 정했다는 기록이고, 그 뒤로 목록이 달라졌다.
  `harucut://` 딥링크는 **아직 구현되지 않았다**(`app.json` 에 scheme 만 있고 들어오는
  URL 을 받는 코드가 없다). 목록에 없는 일을 셸에 얹지 않는다.
- 브리지는 `apps/web/lib/nativeBridge.ts` ↔ `apps/mobile/lib/native-bridge.ts` **한 쌍**이다.
  한쪽만 고치면 프로토콜이 갈라진다. 항상 같이 고친다.
- expo-router 라우트를 새로 만들지 않는다 — ADR-0003 을 되돌리는 일이다.

왜 이렇게 됐나: [`docs/adr/ADR-0003-앱을-웹뷰-셸로.md`](docs/adr/ADR-0003-앱을-웹뷰-셸로.md)
지금 어떻게 도나: [`docs/mobile-shell.md`](docs/mobile-shell.md)

## 저장소 구조

- `apps/web`: Next.js App Router 웹 앱. 화면은 전부 여기 있다.
- `apps/mobile`: Expo 웹뷰 셸(위 참조). 소스 5개 파일.
- `packages/shared`: 웹·앱 공용 모듈 `@harucut/shared`.
  **목록을 문서에 복사하지 않는다** — `packages/shared/src/index.ts` 의 재수출이 곧 진실이다
  (현재 13개 모듈).
- `docs/`: 진입점은 [`docs/README.md`](docs/README.md).
- `scripts/`: 검증 스크립트는 `verify_workspace.py`, `check_backend_contract.py`,
  `check_backend_contract_test.py` 셋이다. 나머지 둘은 검증이 아니다 —
  `camera-probe.html`(실기기에서 열어 카메라를 실측하는 페이지),
  `gen-social-marks.mjs`(소셜 마크 에셋 생성기).

## 규칙의 소유자

한 규칙을 고치면 같이 봐야 할 곳이 있다. **아래 규칙은 여기 옮겨 적지 않는다 — 소유자를 연다.**

| 규칙                              | 소유자                                                                                                                             | 같이 봐야 할 곳                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 라우트 보호·게스트 허용 판정      | `apps/web/lib/protectedPaths.ts` (`PROTECTED_PATHS`, `GUEST_ALLOWED_PREFIXES`, `GUEST_MEMBER_ONLY_PREFIXES`, `isGuestAllowedPath`) | 분기 순서는 `apps/web/proxy.ts`, 문서는 [`docs/auth-routing.md`](docs/auth-routing.md) |
| 게스트가 되는 것·안 되는 것(문구) | `packages/shared/src/guest-trial.ts`                                                                                               | 실제 권한은 `protectedPaths.ts` 가 정한다. 문구와 권한이 갈리면 화면이 거짓말을 한다   |
| 합성 멱등키                       | `apps/web/lib/shootSessionStore.ts` 의 `ensureComposeIdempotencyKey`                                                               | 호출처 `apps/web/app/shoot/result/page.tsx`, `apps/web/lib/pendingGuestSave.ts`        |
| 프레임 **내용**이 달라졌는가      | `apps/web/lib/shootSessionStore.ts` 의 `buildFrameContentKey`                                                                      | 편집기 저장(`ThemeEditorPage`)도 이 함수로 판정한다. 이탈 경고용 `buildEditorSignature` 로 대신하면 안 된다 — 그림에 안 나오는 값까지 본다 |
| 저장 요청에서 빠지는 컴포넌트     | `apps/web/lib/frameApi.ts` 의 `isBlankSourceComponent`                                                                             | `toCreateFrameRequest` 의 필터와 위 지문이 **같은 함수**를 쓴다. 갈라지면 서버에 안 가는 레이어로 멱등키가 버려진다 |
| 브라우저 보관물의 기한 판정       | `apps/web/lib/pendingStorageTtl.ts` 의 `isFreshSavedAt`                                                                            | 게스트 인계(`pendingGuestSave.ts`)와 약관 동의(`pendingTermsConsent.ts`)가 같이 쓴다. 둘 다 공용 기기에서 앞사람 것이 넘어가지 않게 하는 장치다 |
| `cellCutouts` 계약                | [`docs/backend-contract.md`](docs/backend-contract.md)                                                                             | 저장되는가·누가 그리는가를 여기만 적는다                                               |
| 모달 초기 포커스·Tab 트랩·Escape  | `apps/web/hooks/useModalDialog.ts`                                                                                                 | 모달을 새로 만들면 이 훅을 쓴다. 겹친 모달의 최상단 판정까지 여기 있다                 |
| 네이티브 브리지 프로토콜          | `apps/web/lib/nativeBridge.ts` ↔ `apps/mobile/lib/native-bridge.ts`                                                                | 한 쌍. 둘을 같은 커밋에서 고친다                                                       |
| 요금제 사실(이름·기능·표시)       | `packages/shared/src/plans.ts`                                                                                                     | 프레임 한도 상수는 `apps/web/constants/planLimits.ts` — 다른 패키지다                  |

라우트 목록도 여기 복사하지 않는다. 공개·보호 경로의 진실은 `apps/web/lib/protectedPaths.ts`,
설명과 분기표는 [`docs/auth-routing.md`](docs/auth-routing.md) 가 갖는다.
비인증 접근은 `/login?redirectTo=...` 로 보내고, 예외 둘(게스트 체험, 행사 QR `&event=`)도
그 문서에 있다.

## 브랜치 · 커밋 · PR

- 기준 브랜치: `develop`. 릴리즈 브랜치: `main`.
- 작업 브랜치: **`<type>/<slug>`** — 예: `fix/social-login-buttons`, `chore/remove-stray-probe-output`.
  (예전 문서가 말하던 `issue/<number>-<slug>` 로 만든 브랜치는 이 저장소에 하나도 없다.)
- 커밋 메시지: **`<type>(<scope>): <한국어 요약>`** — 예: `fix(terms):`, `fix(shoot):`, `chore(scripts):`.
- 이슈·PR 제목: **`<type>: <한국어 요약>`** — 스코프 없이.
- `<type>` 은 `feat` `fix` `refactor` `docs` `chore` `ci` `test` `perf` 중 하나.
- `main`, `develop`, `develop_loop` 에는 직접 commit/push 하지 않는다.
- `자동 생성`, `auto-generated` 같은 일반 제목은 금지한다.

**훅은 지금 꺼져 있다.** `git config core.hooksPath` 가 빈 값이라 `.git/hooks` 를 본다.
켜려면 한 번 실행한다.

```bash
git config core.hooksPath .githooks
```

켜도 `.githooks/pre-commit`·`pre-push` 가 막는 것은 보호 브랜치(`main|develop|develop_loop`)
위의 commit/push 뿐이다 — **브랜치 이름은 검사하지 않는다.** pre-commit 의 에러 문구가 아직
`issue/<number>-<slug>` 를 말하지만 문구일 뿐 강제되는 규칙이 아니다.

## 검증

- 통합: `pnpm verify:standard` — 락파일 검사 → `lint:web` → `test:web` → `build:web` →
  `lint:mobile` → `typecheck:mobile`. 실제 목록은 `scripts/verify_workspace.py` 의 `GROUPS`.
- 개별: `pnpm lint:web`, `pnpm test:web`, `pnpm build:web`, `pnpm lint:mobile`, `pnpm typecheck:mobile`
- e2e: `pnpm test:e2e:web`
- 앱 수동 확인: [`docs/mobile-qa-checklist.md`](docs/mobile-qa-checklist.md)

`pnpm lint:web` 을 빼먹지 않는다. 미사용 export·도달 불가 분기·죽은 파라미터는 빌드가 아니라
lint 가 잡아서, `verify_workspace.py` 가 이것을 맨 앞에 둔다.

> **인증 흐름을 검증할 때는 `NEXT_PUBLIC_DEV_AUTH_BYPASS` 를 끈다.**
> 켜져 있으면 `apps/web/proxy.ts:51-53` 이 보호 경로 판정을 통째로 건너뛴다(`return NextResponse.next()`).
> 리다이렉트도 401 처리도 돌지 않으므로 **인증 e2e 가 조용히 초록불이 된다.**
> 스위치는 `apps/web/lib/devAuthBypass.ts`, 설명은 `docs/auth-routing.md` 의 `DEV_AUTH_BYPASS` 절.

- 디자인과 사용성은 직접 확인한다. API 통신과 에러 처리도 직접 확인한다.
- **직접 확인하지 않은 기능을 완료라고 쓰지 않는다.**

계약 검사는 `pnpm check:contract`(로컬 백엔드 필요). 경로·죽은 프록시·에러코드만 본다 —
**필수 요청 필드는 검사하지 않고, 빠뜨려도 종료코드는 0 이다.** 사용법과 한계의 소유자는
`docs/README.md` 「계약이 어긋났는지 기계로 확인한다」 절과 `scripts/check_backend_contract.py`
docstring 이다.

## CI

- PR 의 `verify`·`e2e` 잡은 **`run-ci` 라벨이 붙었을 때만** 돈다. 라벨은 사람이 직접 붙인다.
- `develop` 푸시와 Actions 탭 수동 실행은 라벨과 무관하게 항상 돈다.
- 라벨이 없으면 두 잡은 skipped 로 끝나고 GitHub 이 이를 필수 검사 통과로 인정한다 —
  **CI 없이 병합하는 것이 가능하다.** 병합 전에 라벨을 한 번 붙이거나 로컬에서
  `pnpm verify:standard` 와 `pnpm test:e2e:web` 을 돌린다.

규칙의 소유자는 `.github/workflows/verify.yml` 상단 주석이다(왜 자동 부착을 걷어냈는지 포함).

## 참고 문서

**먼저 [`docs/README.md`](docs/README.md) 를 연다.** 문서 지도와 *이미 확인이 끝난 사실*이
거기 있다 — 계약 대조 결과, 앱에서 이미 정상이라 손대지 않은 것(근거 포함), 백엔드 답을
기다리는 것. 조사를 시작하기 전에 여기서 이미 답이 나와 있는지 본다.

- [`docs/adr/ADR-0003-앱을-웹뷰-셸로.md`](docs/adr/ADR-0003-앱을-웹뷰-셸로.md) — 앱이 무엇을 하는가(왜)
- [`docs/mobile-shell.md`](docs/mobile-shell.md) — 셸이 지금 어떻게 도나
- [`docs/auth-routing.md`](docs/auth-routing.md) — 로그인·리다이렉트·게스트 체험
- [`docs/route-flows.md`](docs/route-flows.md) — 화면 이동 흐름
- [`docs/backend-contract.md`](docs/backend-contract.md) — 백엔드가 실제로 주고받는 것
- [`docs/mobile-qa-checklist.md`](docs/mobile-qa-checklist.md) — 앱 수동 확인
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — 외부 기여자용 안내
- [`README.md`](README.md)

## 도구별 차이

`.claude/settings.local.json` 이 Claude Code 에서만 도는 훅을 켜 둔다 — Edit/Write 후와 Stop 에
`.claude/skills/impeccable/scripts/hook.mjs`(디자인 점검). Codex 에는 이 훅이 없다.
규칙 자체는 두 도구가 같은 것을 봐야 하므로 이 파일에 적는다.

## 응답 규칙

- 기본 응답 언어는 한국어
- 별도 요청이 없으면 이슈, PR, 커밋, 설명 문구도 한국어 우선
- 서술형보다 정리형 표현 우선
- `...합니다`, `...했습니다`보다 `... 정리`, `... 조정`, `... 제거` 톤 우선
- 짧고 직접적인 문장 우선
