# 문서 지도

**여기부터 본다.** 아래 표는 "무엇을 알고 싶을 때 어디를 여는가"이고,
그다음 절은 **이미 확인이 끝난 사실**이다 — 같은 걸 다시 조사하지 않기 위해 적어 둔다.

## 어디를 여나

| 알고 싶은 것 | 문서 |
|---|---|
| 백엔드가 실제로 뭘 주고받나 (경로·필드·에러코드) | [backend-contract.md](./backend-contract.md) |
| 로컬 백엔드 띄우기 (도커·Apple Silicon·계정 만들기) | [local-backend.md](./local-backend.md) |
| 백엔드에 **요청해야 할 것** (OAuth·비회원 합성·푸시·합성 원본 정리) | [app-shell-backend-requests.md](./app-shell-backend-requests.md) |
| 앱(iOS·Android) 웹뷰 셸 구조와 촬영 화질 | [mobile-shell.md](./mobile-shell.md) |
| 화면 이동 흐름 | [route-flows.md](./route-flows.md) |
| 로그인·리다이렉트·게스트 체험 | [auth-routing.md](./auth-routing.md) |
| 앱 QA 수동 확인 | [mobile-qa-checklist.md](./mobile-qa-checklist.md) |
| 디자인 검수(2026-09-06) — 어떻게 봤고 무엇이 남았나 | [design-audit-2026-09-06.md](./design-audit-2026-09-06.md) |
| 왜 이렇게 정했나 | [adr/](./adr/) |
| 지난 계획 — **실행 기준 아님** | [archive/](./archive/) (각 문서 머리에 왜 보관인지 적혀 있다) |

이 문서를 뺀 `docs/` 아래 전부가 위 표에 있다. 표에 없는 문서를 다른 곳이 가리키고 있다면
그쪽 링크가 낡은 것이다.

비회원(게스트)이 왜 그렇게 도는지는 이 문서 아래 "비회원 구조" 절에 있다 — 서버에 게스트
개념이 없다는 사실 하나에서 조각 프로토콜과 인계 보관소가 전부 따라 나온다.

## 계약이 어긋났는지 기계로 확인한다

손으로 대조하면 백엔드가 한 번 나가는 날 낡는다. 실제로 그렇게 낡아서
`ComposeRequest.backgroundColor` 가 열린 걸 한동안 못 썼고, 서버에 없는 에러코드가
프론트 문구표에 "처리하고 있다"는 얼굴로 남아 있었다(지금은 죽은 항목 0).

```bash
# 로컬 백엔드를 띄운 뒤 (docs/local-backend.md)
pnpm check:contract                                          # 요약
python3 scripts/check_backend_contract.py --show-required    # 필수 요청 필드까지
```

인자를 넘길 때 **`--` 를 끼우지 않는다.** pnpm 10 은 `--` 를 스크립트에 그대로 넘기고
argparse 가 `unrecognized arguments: -- --show-required` 로 끊는다(종료코드 2).
`pnpm check:contract --show-required` 도 되지만, 인자 있는 실행은 위처럼 스크립트를
직접 부르는 편이 함정이 없다.

보는 것은 셋뿐이다(A·B·C): ① 프론트 프록시가 부르는 경로가 백엔드에 있나 ② 아무도 안
부르는 프록시가 있나 ③ 에러코드 표가 서버와 1:1 인가. 그래서 통과 문구도 `A·B·C 일치 ✓`
라고만 나온다. **필수 요청 필드는 검사하지 않는다** — `--show-required` 는 스웨거가 필수라고
적은 필드를 보여 줄 뿐이고, 프론트가 실제로 싣는지는 사람이 대조한다(요청 본문이 프록시가
아니라 `apps/web/lib` 에서 만들어져 정적으로 읽기 어렵다). **필수 필드를 빠뜨려도 종료코드는
0 이다** — 여기서 초록불이 떴다고 계약 전부가 맞았다는 뜻은 아니다.

에러코드는 **컨테이너 안 jar 의 `ErrorCode` enum** 에서 직접 뽑는다 — 스웨거 응답 예시만
보면 문서화되지 않은 코드(`GEN-091` 같은 5xx)를 죽은 항목으로 잘못 짚는다. 스웨거에 적힌
코드는 jar 의 52개보다 적다(세는 방법에 따라 45~47).

스크립트가 검사 범위를 넘겨 말하지 않는지는 `python3 scripts/check_backend_contract_test.py`
로 본다 — 백엔드도 도커도 없이 돈다.

계약 대조는 A·B·C·D 네 가지다. D 는 **FE 가 실제로 보내는 본문**과 스웨거의 required 를
기계가 맞춰 본다 — 예전에는 목록만 찍고 "대조는 사람이 한다" 였는데, 사람이 하는 대조는 결국
안 해서 `fileSize`·`sourceKeys` 가 그렇게 새어 나갔다. 본문을 변수로 넘기면 그 변수의 타입까지
따라간다. 못 따라가면 조용히 통과시키지 않고 "확인 못 함" 으로 남긴다.

전체 검증은 `pnpm verify:standard`. 맨 앞에 `pnpm install --frozen-lockfile` 락파일 검사가
붙고 그다음이 lint:web·**check:classes:web**·**typecheck:shared**·test:web·build:web·
lint:mobile·typecheck:mobile 이다 — 목록의 진실은 `scripts/verify_workspace.py` 의 `GROUPS`
딕셔너리다. macOS 에서도 그냥 돈다.

새로 붙은 둘은 이렇다.

- `check:classes:web` — Tailwind 임의값 클래스 중 **같은 CSS 를 만드는 정규형이 있는 것**을 막는다
  (`apps/web/scripts/check-canonical-classes.mjs`). 표를 들고 있지 않고 후보를 실제로 컴파일해
  값으로 비교하므로 Tailwind 가 올라가도 따라간다. 규칙과 예외는 `apps/web/DESIGN.md`
  「클래스 표기 — 정규형을 쓴다」.
- `typecheck:shared` — 루트 `tsconfig.json` 으로 `packages/*/src` 를 검사한다. 이게 없던 동안
  `packages/shared` 의 `*.test.ts` 두 개는 **jest 는 도는데 타입은 아무도 안 보는** 상태였다.

E2E 를 돌릴 때는 `NEXT_PUBLIC_DEV_AUTH_BYPASS` 가 켜져 있으면 인증 검증이 조용히 통과한다.
규칙과 강제 장치는 [auth-routing.md](./auth-routing.md#dev_auth_bypass-로컬-전용) 에 있다.

---

# 이미 확인이 끝난 것 (다시 조사하지 말 것)

## 계약 — 어긋난 곳 없음 (2026-09-02 재실행)

| 항목 | 결과 |
|---|---|
| 프론트 프록시 37개 핸들러 → 백엔드 경로 | **37/37 존재** |
| 호출되지 않는 프록시 라우트 | 없음 |
| 에러코드 (jar 52개) ↔ 프론트 문구표 | **누락 0 · 죽은 항목 0** |
| 필수 요청 필드 | 2026-09-01 손 대조 · 09-02 재확인. 어긋남 다섯 건은 **전부 프론트를 고쳐 맞췄다** — 남은 것 없음 |

표의 앞 세 줄은 `pnpm check:contract` 한 번이면 다시 나오는 값이다 — 숫자가 의심되면 여기를
읽지 말고 돌린다. 마지막 줄은 스크립트가 검사하지 않는 부분이라 사람이 대조해야 하고,
**엔드포인트 개수를 여기 적어 두면 그 자체가 낡는다** — `--show-required` 출력이 목록이다
(8-28 에 15개였던 것이 9-01 에 16개가 됐다). 다섯 건이 무엇이었고 어떻게 고쳤는지는
[backend-contract.md 「이번에 고친 어긋남」](backend-contract.md) 5~9 번에 있다.

## 비회원(게스트) 구조 — 서버에는 게스트가 없다

게스트 흐름이 왜 그렇게 생겼는지는 이 한 줄이 전부 설명한다. **백엔드에 비회원 개념이
아예 없다.** 게스트 모드는 프론트가 혼자 만든 것이다.

| 확인한 것 | 결과 | 확인 방법 |
|---|---|---|
| 스웨거 경로 53개 중 guest/anonymous 경로 | **0개** | `curl -s http://localhost:8080/v3/api-docs` |
| 스펙 전문의 `guest` · `anonymous` 문자열 | **각각 0건** | 같은 응답을 grep |
| jar 클래스 321개 중 두 단어를 담은 파일 | **각각 0개** | `docker exec harucut-app` → `unzip -q /app/app.jar 'BOOT-INF/classes/*'` 후 `grep -ril guest` |
| 합성·업로드 경로 | 전부 `/api/auth/` 아래 | `POST /api/auth/user/media/compose`, `POST /api/auth/user/files/presigned-upload` |

(2026-09-02 실측. 쿠키로 게스트를 가르는 규칙은 [auth-routing.md](./auth-routing.md) 가 소유한다.)

여기서 나머지가 따라 나온다.

1. **비회원 결과물은 브라우저가 그린다.** `composeFramePng`(`apps/web/lib/canvas/composeFrame.ts`)
   이 캔버스로 그린 blob 이 곧 결과물이고, 회원은 서버가 그린다 —
   `apps/web/app/shoot/result/page.tsx` 의 `if (guestMode)` 분기가 갈림길이다.
2. **그래서 base64 조각 프로토콜이 있다.** 회원 결과물은 https URL 이라 주소만 넘기면
   네이티브가 받아 온다. 비회원 blob 은 주소가 없다. 앱 셸 안에서는 `<a download>` 가
   아무 일도 하지 않으므로, 사진첩에 넣는 유일한 길이 blob 을 base64 로 쪼개
   네이티브에 넘기는 것이다. 규칙은 `apps/web/lib/nativeBridge.ts` ↔
   `apps/mobile/lib/native-bridge.ts` **한 쌍**이 갖는다(조각 크기는 3의 배수여야 한다는
   이유까지 그 주석에 있다).
3. **비회원이 만든 것을 계정으로 옮기려면 브라우저 저장소를 건너야 한다.**
   `apps/web/lib/pendingGuestSave.ts` 가 원본 4장과 만드는 방법을 **IndexedDB 에 Blob 으로**
   담아 두고, 로그인 뒤 `GuestTrialBridge` 가 그걸로 서버 합성을 부른다. 예전에는
   localStorage 였다 — 왜 옮겼는지는 아래.

### 인계 보관소를 IndexedDB 로 옮겼다 (2026-09-02 실측, 적용됨)

**지금은 IndexedDB 에 Blob 으로 담는다.** 예전에는 data URL 문자열을 localStorage 에 담았다.
왜 옮겼는지는 실측 하나로 정리된다 — **터지고 있었던 게 아니라 여유가 없었다.**

입력별로 갈린다. 표의 세 줄은 **서로 다른 그림**이고, 그래서 결론도 다르다.

| 입력 (전부 q=0.92 data URL) | 1장 | 4장 |
|---|---|---|
| **실제 카메라 사진** 16MP(4624×3468)를 슬롯 안에 맞춰 1700×1275 로 — 실기기 측정 | 0.68MB | **2.71MB** — 한도 안 |
| 사진 근사 합성(그라디언트 + 중간주파수 + 그레인) 1700×2400 | 1.46MB / 2.25MB | 5.85 / 9.02MB — 한도 밖 |
| 난수 픽셀 1700×2400 (압축 최악, 현실에 없음) | 4.55MB / 6.35MB | 18.2 / 25.4MB — 한도 밖 |

*(두 값은 Chromium / WebKit. localStorage 용량은 **4.75MB** 로 두 엔진 동일.)*

**"보통 사진에서 실패한다"고 적었던 것은 과장이다.** 실기기의 실제 카메라 사진 넷은 2.71MB 로
한도 안에 들었다. 다만 합성 입력이 조금만 거칠어져도(가운데 줄) 바로 넘긴다 — 실제 사진과
난수 사이의 넓은 구간이 위험 구간이라는 뜻이다.

남는 자리도 2MB 뿐이었다 — localStorage 는
출처 하나에 한 벌이라 프레임 꾸미기 초안(`lib/themeEditorDraft.ts`, 최대 4.5MB) 같은 다른
기능과 같은 예산을 나눠 쓴다. 사진이 조금 크거나 옆 기능이 먼저 자리를 잡으면 그때 터진다.

**그래서 저장소를 바꿨다.** IndexedDB 는 Blob 을 그대로 담아 base64 +33% 가 없고 4.75MB 벽도
없다. 바깥에서 보이는 모양은 그대로다 — 들어오고 나가는 `sources` 는 여전히 data URL 이고
(변환은 `pendingGuestSave.ts` 안에서만 한다), 달라진 것은 **API 가 비동기라는 것 하나**다.
예전 localStorage 보관물(v2)은 **한 번 더 읽어 주고** 읽는 김에 걷어낸다 — 배포되는 순간
보관물을 들고 로그인하러 간 사람의 인계를 우리 사정으로 버리지 않는다.

같이 없앤 것이 **조용한 실패**다. 예전 구현은 `setItem` 예외를 삼키고 `false` 만 돌려줬다.
지금은 쓴 뒤 되읽어 확인하고(트랜잭션 `oncomplete` 까지 기다린다), 못 담으면 닫힌 실패로
끝내 화면이 "먼저 내려받으라"고 안내한다(`lib/guestTrialStore.ts` 의 `showGuestSavedNotice`).

**남은 실패 조건은 셋뿐이고 전부 닫힌 실패다** — 저장을 못 했다는 것이 화면에 뜬다.

- IndexedDB 를 못 쓰는 자리(사생활 보호 모드, 저장소 차단): `open` 이 null → `false`
- 다른 탭이 옛 버전 DB 를 붙잡은 경우(`onblocked`): 기다리지 않고 `false`
- `open` 이 성공도 실패도 하지 않고 멎는 사파리 사례: 5초에 끊는다(`OPEN_TIMEOUT_MS`)

촬영본을 슬롯 크기까지 줄이는 것(`useCaptureFlow.ts` 의 `outputScale`, 불러온 사진은
`lib/photoImport.ts`)은 그대로 둔다. 다만 **이유가 바뀌었다** — 저장소 한도가 아니라
서버 쪽 확대를 막는 것이다.

### 확인하지 못한 것 — iOS 캔버스 상한

`composeFrame.ts` 는 "iOS Safari 가 캔버스 넓이 2^24(16,777,216)px 를 넘으면 빈 이미지가
되거나 `toBlob` 이 null" 이라고 적고 `MAX_CANVAS_PIXELS = 16_000_000` 으로 줄인다.
**이번에 확인되지 않았다** — 데스크톱 WebKit 은 24MP 를 그리고 인코딩까지 문제없이 했다.
실기기가 필요한 주장이라, 확인될 때까지 사실로 인용하지 않는다. 줄이는 코드 자체는
비용이 크지 않으니 그대로 둔다.

## 앱에서 이미 정상이라 손대지 않은 것

재조사하기 쉬운 것들이라 근거까지 적어 둔다.

| 의심했던 것 | 실제 | 근거 |
|---|---|---|
| 안드로이드 카메라 런타임 권한을 아무도 요청 안 한다 | **`react-native-webview` 가 직접 요청한다** | `RNCWebChromeClient.onPermissionRequest` 가 `RESOURCE_VIDEO_CAPTURE` → `Manifest.permission.CAMERA` 로 옮겨 `requestPermissions` 호출 |
| 세이프에어리어(노치)를 셸이 안 잡는다 | **반은 맞았다 → 2026-09-06 셸이 잡게 고쳤다** | 웹은 `env(safe-area-inset-bottom)` 만 5곳에서 쓰고 **top 은 0곳**이었다. 안드로이드 WebView 는 상태바 높이를 env 에 주지 않고 iOS 는 RN-webview 기본값이 `never` 라 모든 화면 상단이 상태바 아래로 들어갔다. 지금은 셸이 `insets.top`(양쪽)·`insets.bottom`(안드로이드)을 비운다 — [`docs/mobile-shell.md`](mobile-shell.md) 표 「안전영역」 |
| 안드로이드 13+ `POST_NOTIFICATIONS` 가 빠졌다 | **라이브러리가 넣는다** | `expo-notifications` 의 `android/src/main/AndroidManifest.xml` 에 선언 → Gradle 머지 |

## 촬영 화질 — 두 가지를 고쳤다

1. **해상도를 슬롯 방향에 맞춰 요청한다.** 예전에는 방향과 무관하게 늘 가로 1920x1080 을
   달라고 해서 **네 레이아웃 모두 확대**됐다(세로 슬롯은 2.22배). 4K 를 주는 기기에서는
   확대가 사라진다.
2. **사진 파이프라인으로 찍는다**(`ImageCapture.takePhoto`). 영상 프레임을 긁는 대신
   카메라 앱이 쓰는 경로를 탄다. Chromium·WebKit 두 엔진에서 실제로 호출해 동작을 확인했다.
   지원하지 않거나 이득이 없으면 조용히 예전 경로로 떨어진다.

계산 표와 근거는 [mobile-shell.md](./mobile-shell.md) 가 갖는다 — 화질 절 하나뿐이다.
**실기기 확인**은 `scripts/camera-probe.html` 을 폰에서 열면 된다(https 또는 localhost 필요) —
스트림 해상도·스틸 최대·렌즈 개수·`takePhoto` 소요시간을 한 화면에 보여 준다.

**남은 결정**: 네이티브 카메라(`expo-camera`)로 옮길지. 사진 파이프라인은 위에서 웹으로도
가져왔으므로 **남는 차이는 렌즈 선택뿐이다**(iOS 는 후면 렌즈를 하나만 노출한다).
ADR-0003 을 되돌리는 일이라 손대지 않았다.

## 요금제 — ⚠️ 서버와 화면이 다르다 (백엔드 확인 필요)

**지금 도는 백엔드는 세 등급이 전부 무제한이다.** 스웨거 설명("BASIC 0 / PLUS 3 / PRO -1")
과도, 이 레포의 8-20 실측과도 다르다. 근거 셋이 같은 말을 한다 — 사용량 API 응답,
BASIC 계정으로 프레임 저장 성공(200), jar 의 `PlanTier` enum 이 세 등급 모두
`FrameLimit$Unlimited`. 자세한 근거는 [backend-contract.md](./backend-contract.md) 의
요금제 절이 갖는다.

결제가 닫혀 있어서 일부러 연 것인지 정책이 빠진 것인지에 따라 프론트가 할 일이 갈린다.
**답을 받기 전까지 가격표 문구를 고치지 않는다.**

## 요금제 화면 구성 (2026-08-28 결정)

가격표는 **무료 · 베이직 · 엔터프라이즈** 셋이다.

| 화면 | 서버 등급 | 비고 |
|---|---|---|
| 무료 | `BASIC` | 0원 |
| 베이직 | `PLUS` | ₩3,900 |
| 엔터프라이즈 | (등급 아님) | 행사용, 견적 문의 |

`PRO`(₩9,900)는 **가격표에서 내렸지만 등급은 살아 있다** — 쿠폰(`grantTier: PRO`)으로 받은
사용자가 실제로 존재한다. 그래서 `toPlanId`·`PLAN_NAMES`(`packages/shared/src/plans.ts`)와
`PLAN_FRAME_LIMITS`(`apps/web/constants/planLimits.ts` — 패키지가 다르다)는 계속 PRO 를
안다. 여기서 PRO 를 지우면 그 사용자의 등급이 "모르는 값"이 되어 마이페이지가 **무료라고
잘못 표시한다.**

피처 행은 **서버가 실제로 가르는 것만** 적는다. 백엔드가 요금제로 가르는 것은 커스텀 프레임
개수와 보관 기간 둘뿐이다 — 스펙 전문에 `광고` 0건, `filter` 0건, `보정` 1건(그마저
"개수를 0으로 **보정**한다"는 다른 뜻). 예전 표의 "광고 제거"·"AI(추후)" 행은 그래서 뺐다.

## 서버 합성 — 배경색은 요청으로 보낸다

`ComposeRequest.backgroundColor`(`#RRGGBB`)가 열려 있다. 예전에는 이 자리가 없어서
회원에게 색 고르기를 막고, 미리보기를 서버 값에 맞추려고 프레임 목록을 **촬영 1회당 2번**
더 조회했다(`useServerFrameBackground`). 지금은 색을 요청에 실어 보내고 그 우회로는 없앴다.

주의 둘:
- **단색(COLOR) 배경 프레임에서만** 보낼 수 있다. 이미지 배경에 보내면 400 이라,
  꾸민 프레임(`remoteFrameId`)에는 보내지 않고 400 이 오면 색만 빼고 한 번 더 시도한다.
- 같은 `idempotencyKey` 로 색만 바꿔 보내면 **무시된다**(서버가 기존 작업을 재생한다).
  그래서 색이 합성 키(`generationKey`)에 들어 있다.

## 응답 봉투 — `data` 와 `message` 는 없을 수 있다

```
성공: {"code":"GEN-000","status":200}                      ← data 도 message 도 키가 없다
실패: {"code":"COUPON-001","status":404,"message":"..."}   ← message 는 실패에만
```

실제 응답으로 확인했다. 그래서 `ApiEnvelope` 의 두 필드는 선택이고, 값이 꼭 필요한 자리는
`requireData()`(`apps/web/lib/apiEnvelope.ts`)로 꺼낸다 — 없으면 어디서 비었는지 이름을
달고 즉시 끊는다.

## 백엔드에 없는 필드를 읽지 않는다

`UserMediaResponse` 에 `displayname`(소문자)·`originalFileName` 은 **없다.** jar 전체를
뒤져도 `displayName`(camelCase)만 나온다. 폴백으로 읽던 8곳을 걷어냈다 — 실행될 수 없는
분기라 있으면 "처리했다"는 착각만 준다.

---

# 아직 막혀 있는 것

| 무엇 | 누가 | 왜 막혔나 |
|---|---|---|
| 앱 구글 로그인 | **백엔드** | 구글이 임베디드 WebView 를 막는다(여기서 **재현은 못 했다** — 실기기와 구글 왕복이 필요하다). 외부 브라우저로 열면 쿠키가 브라우저에 남아 앱은 로그아웃 상태 — 일회용 코드 교환이 필요하다 |
| 비회원 서버 합성 | **백엔드** | 합성·업로드가 전부 인증 경로 아래. 행사 참가자 판매 문구와 어긋난다 |
| 서버 발신 알림 | **백엔드** | 기기 토큰 등록 엔드포인트 0건. 로컬 알림만 넣었다 |
| 요금제 정책 | **백엔드** | 위 "요금제" 절 |
| 안드로이드 알림 아이콘 | **디자인** | 흰색 실루엣 + 투명 배경 PNG. 풀컬러를 주면 상태바에 흰 사각형만 뜬다 |
| 네이티브 카메라 전환 | **결정** | ADR-0003 을 되돌리는 일 |
