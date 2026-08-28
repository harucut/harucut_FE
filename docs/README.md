# 문서 지도

**여기부터 본다.** 아래 표는 "무엇을 알고 싶을 때 어디를 여는가"이고,
그다음 절은 **이미 확인이 끝난 사실**이다 — 같은 걸 다시 조사하지 않기 위해 적어 둔다.

## 어디를 여나

| 알고 싶은 것 | 문서 |
|---|---|
| 백엔드가 실제로 뭘 주고받나 (경로·필드·에러코드) | [backend-contract.md](./backend-contract.md) |
| 로컬 백엔드 띄우기 (도커·Apple Silicon·계정 만들기) | [local-backend.md](./local-backend.md) |
| 백엔드에 **요청해야 할 것** (OAuth·비회원 합성·푸시) | [app-shell-backend-requests.md](./app-shell-backend-requests.md) |
| 앱(iOS·Android) 웹뷰 셸 구조와 촬영 화질 | [mobile-shell.md](./mobile-shell.md) |
| 화면 이동 흐름 | [route-flows.md](./route-flows.md) |
| 로그인·리다이렉트·게스트 체험 | [auth-routing.md](./auth-routing.md) |
| 앱 QA 수동 확인 | [mobile-qa-checklist.md](./mobile-qa-checklist.md) |
| 왜 이렇게 정했나 | [adr/](./adr/) |

## 계약이 어긋났는지 기계로 확인한다

손으로 대조하면 백엔드가 한 번 나가는 날 낡는다. 실제로 그렇게 낡아서
`ComposeRequest.backgroundColor` 가 열린 걸 한동안 못 썼고, 서버에 없는 에러코드 10개가
"처리하고 있다"는 얼굴로 남아 있었다.

```bash
# 로컬 백엔드를 띄운 뒤 (docs/local-backend.md)
pnpm check:contract                      # 요약
pnpm check:contract -- --show-required   # 필수 요청 필드까지
```

보는 것: ① 프론트 프록시가 부르는 경로가 백엔드에 있나 ② 아무도 안 부르는 프록시가 있나
③ 에러코드 표가 서버와 1:1 인가. 에러코드는 **컨테이너 안 jar 의 `ErrorCode` enum** 에서
직접 뽑는다 — 스웨거 응답 예시만 보면 문서화되지 않은 코드(`GEN-091` 같은 5xx)를 죽은
항목으로 잘못 짚는다(스웨거 45개 vs jar 52개로 갈렸다).

전체 검증은 `pnpm verify:standard` (lint·test·build·mobile). macOS 에서도 그냥 돈다.

---

# 이미 확인이 끝난 것 (다시 조사하지 말 것)

## 계약 — 어긋난 곳 없음 (2026-08-28)

| 항목 | 결과 |
|---|---|
| 프론트 프록시 37개 핸들러 → 백엔드 경로 | **37/37 존재** |
| 호출되지 않는 프록시 라우트 | 없음 |
| 에러코드 (jar 52개) ↔ 프론트 문구표 | **누락 0 · 죽은 항목 0** |
| 필수 요청 필드 (15개 엔드포인트) | 전부 충족 |

## 앱에서 이미 정상이라 손대지 않은 것

재조사하기 쉬운 것들이라 근거까지 적어 둔다.

| 의심했던 것 | 실제 | 근거 |
|---|---|---|
| 안드로이드 카메라 런타임 권한을 아무도 요청 안 한다 | **`react-native-webview` 가 직접 요청한다** | `RNCWebChromeClient.onPermissionRequest` 가 `RESOURCE_VIDEO_CAPTURE` → `Manifest.permission.CAMERA` 로 옮겨 `requestPermissions` 호출 |
| 세이프에어리어(노치)를 셸이 안 잡는다 | **웹이 잡는다** | `viewportFit: "cover"` + 화면들이 `env(safe-area-inset-*)` 사용 |
| 안드로이드 13+ `POST_NOTIFICATIONS` 가 빠졌다 | **라이브러리가 넣는다** | `expo-notifications` 의 `android/src/main/AndroidManifest.xml` 에 선언 → Gradle 머지 |

## 촬영 화질 — 두 가지를 고쳤다

1. **해상도를 슬롯 방향에 맞춰 요청한다.** 예전에는 방향과 무관하게 늘 가로 1920x1080 을
   달라고 해서 **네 레이아웃 모두 확대**됐다(세로 슬롯은 2.22배). 4K 를 주는 기기에서는
   확대가 사라진다.
2. **사진 파이프라인으로 찍는다**(`ImageCapture.takePhoto`). 영상 프레임을 긁는 대신
   카메라 앱이 쓰는 경로를 탄다. Chromium·WebKit 두 엔진에서 실제로 호출해 동작을 확인했다.
   지원하지 않거나 이득이 없으면 조용히 예전 경로로 떨어진다.

계산 표와 근거는 [mobile-shell.md](./mobile-shell.md#촬영-화질--실측과-남은-선택지).
**실기기 확인**은 `scripts/camera-probe.html` 을 폰에서 열면 된다(https 또는 localhost 필요) —
스트림 해상도·스틸 최대·렌즈 개수·`takePhoto` 소요시간을 한 화면에 보여 준다.

**남은 결정**: 네이티브 카메라(`expo-camera`)로 옮길지. 사진 파이프라인은 위에서 웹으로도
가져왔으므로 **남는 차이는 렌즈 선택뿐이다**(iOS 는 후면 렌즈를 하나만 노출한다).
ADR-0003 을 되돌리는 일이라 손대지 않았다.

## 요금제 — ⚠️ 서버와 화면이 다르다 (백엔드 확인 필요)

**지금 도는 백엔드는 세 등급이 전부 무제한이다.** 스웨거 설명("BASIC 0 / PLUS 3 / PRO -1")
과도, 이 레포의 8-20 실측과도 다르다. 근거 셋이 같은 말을 한다 — 사용량 API 응답,
BASIC 계정으로 프레임 저장 성공(200), jar 의 `PlanTier` enum 이 세 등급 모두
`FrameLimit$Unlimited`. 자세한 근거는
[backend-contract.md](./backend-contract.md#-지금-백엔드는-모든-등급이-무제한이다-2026-08-28-실측).

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
사용자가 실제로 존재한다. 그래서 `toPlanId`·`PLAN_NAMES`·`PLAN_FRAME_LIMITS` 는 계속 PRO 를
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
| 앱 구글 로그인 | **백엔드** | 구글이 임베디드 WebView 금지. 외부 브라우저로 열면 쿠키가 브라우저에 남아 앱은 로그아웃 상태 — 일회용 코드 교환이 필요하다 |
| 비회원 서버 합성 | **백엔드** | 합성·업로드가 전부 인증 경로 아래. 행사 참가자 판매 문구와 어긋난다 |
| 서버 발신 알림 | **백엔드** | 기기 토큰 등록 엔드포인트 0건. 로컬 알림만 넣었다 |
| 요금제 정책 | **백엔드** | 위 "요금제" 절 |
| 안드로이드 알림 아이콘 | **디자인** | 흰색 실루엣 + 투명 배경 PNG. 풀컬러를 주면 상태바에 흰 사각형만 뜬다 |
| 네이티브 카메라 전환 | **결정** | ADR-0003 을 되돌리는 일 |
