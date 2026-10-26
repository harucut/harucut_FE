# 고도화 기획서 R3 검수 — 프론트

2026-10-26 · 대상: 「하루컷 제품 고도화 기획서」 R3(촬영 전용·부스·페이지 디자인·프레임 허용 목록 반영본)

- R3 를 프론트 저장소(`harucut_FE`) 코드와 대조했다. 코드는 고치지 않았다.
- 프론트 기준 커밋: `c431f61`(develop). 앱 코드는 `abc1fe7` 과 같다. R3 가 「프론트 커밋 미표기」라고 적은 S24 자리에 이 값을 넣으면 된다.
- 백엔드 부분은 백엔드 세션이 따로 검수했다(아래 「백엔드 검수」, 백엔드 커밋 8bab406).
- 기획서에 보낼 것만 보려면 「R3 에 반영을 요청할 것 (프론트)」, 「사용자 결정」, 「백엔드: R3 에 반영을 요청할 것」 세 절을 본다.
- 지난 검수: `docs/plan-review-2026-10-25.md`.
- 근거는 `file:line` 으로 적었다. 경로는 저장소 루트 기준이다.

## 총평

- 지난 검수의 프론트 지적은 모두 반영됐다.
  - 배경 이미지가 이미 있다는 점, PHOTO = 이미지 레이어, 잠금·undo·자동 저장의 현재 상태.
  - 누끼 모델 둘(MediaPipe / @imgly)과 AGPL 범위.
  - 약관 제8조, `pendingGuestSave`, 경로 판정(`protectedPaths.ts`·`proxy.ts`).
  - 브리지 한 쌍, `harucut://` 미구현, 계약 CI 가 운영 스펙을 읽는 점.
- 열린 질문이던 「행사 참가자 갤러리 허용」은 **촬영 전용으로 확정**됐다. 갤러리 스위치도 만들지 않는다. 이 문서에서도 그대로 따른다.
- R3 에서 새로 들어온 요구(부스, 전체 화면 테마, 로고 숨김, 두 단계 허용 목록)는 프론트 코드에 **기반이 거의 없다.** 아래 「새로 드러난 프론트 제약」이 그 목록이다.
- 가장 급한 것은 1번이다. 지금 운영 중인 행사 QR 경로가 R3 정책과 이미 어긋난다.

## 새로 드러난 프론트 제약

### 1. 지금의 행사 QR 경로가 「촬영 전용」과 어긋난다

- 지금 행사 QR 은 `/shoot?frame=...&event=행사이름` 이다. `event` 는 화면에 띄우는 이름일 뿐이다(`apps/web/app/shoot/page.tsx:56-59`).
- 같은 주소에 `source=upload` 를 붙이면 갤러리 불러오기로 간다(`apps/web/app/shoot/page.tsx:54`, `apps/web/app/shoot/upload/page.tsx:101`).
  - 비회원은 막힌다. 프록시와 화면이 둘 다 막는다(`apps/web/lib/protectedPaths.ts:33`, `apps/web/app/shoot/upload/page.tsx:94-`).
  - **회원은 행사 QR 로 들어와도 갤러리를 쓸 수 있다.** R3 F05(회원·비회원 모두 촬영 전용)와 다르다.
- 행사 QR 로 들어온 비회원은 게스트 체험 쿠키(7일)를 받는다(`apps/web/app/shoot/page.tsx:93-109` → `enterGuestMode`).
  - R3 는 「일반 게스트 쿠키를 행사 참가 인증으로 쓰지 않는다」고 한다. 지금 구조는 행사 참가를 일반 체험으로 처리한다.
- 회원이 행사 QR 로 찍으면 결과가 **개인 보관함**에 저장된다(`apps/web/app/shoot/result/page.tsx:522` `saveFourcutToServer`). R3 F08(행사 사진은 행사에 남고 개인으로 자동 이전하지 않음)과 다르다.
- **정리:** 행사 참가는 `/shoot` 위에 쿼리를 얹는 방식으로는 안 된다. `/e/{slug}` 라는 별도 흐름이 필요하다.
  - 별도 흐름에는 갤러리 진입, `source`·`frame` 쿼리, 개인 저장, 게스트 쿠키 전환이 아예 없어야 한다.
  - 이미 인쇄해 배포한 `/shoot?event=` QR 을 어떻게 처리할지 정해야 한다. 아래 「확인이 필요한 것」 1번.

### 2. 부스 초기화 — 촬영 사진이 기기에 남고 「이어 찍기」로 되살아난다

- 촬영 세션은 IndexedDB 에 저장된다. 저장 필드: 찍은 사진, 프레임, 선택, 멱등키, 행사 이름(`apps/web/lib/shootSessionPersistence.ts:9`).
- 저장 칸은 **출처(origin)당 하나**다. 행사, 기기, 회차로 나뉘지 않는다.
- `/shoot` 에 들어오면 남은 사진이 있으면 「이어 찍기」를 제안한다(`apps/web/app/shoot/page.tsx:50`).
- 그래서 지금 구조를 부스에 그대로 쓰면 R3 가 막으려는 일이 바로 생긴다.
  - 다음 팀이 이전 팀 사진을 본다(F24).
  - 두 탭이 서로 다른 행사에 참가하면 사진이 섞인다(F25).
- 지울 것이 더 있다.
  - `pendingGuestSave`(IndexedDB, `apps/web/lib/pendingGuestSave.ts`).
  - 게스트 체험 쿠키.
  - 결과 화면의 object URL.
- **필요한 것:** 행사 흐름의 임시 저장은 `행사·회차` 단위 키로 분리한다. 부스 모드에서는 이어 찍기를 끈다. 다음 참가자로 넘어갈 때 위 항목을 한 번에 지우는 함수가 필요하다.

### 3. 하루컷 브랜드가 전역에 박혀 있다 — 로고 숨김은 별도 레이아웃이 필요하다

- 브랜드가 나오는 곳 중 상당수가 **모든 경로에 공통**이다.
  - 페이지 제목, 설명, OG 이미지, `applicationName`, 파비콘, 매니페스트: 루트 레이아웃 정적 메타데이터(`apps/web/app/layout.tsx:18-47`). R3 18절의 「공유 미리보기·페이지 제목」이 여기 걸린다.
  - 루트 레이아웃이 모든 경로에 전역 브리지를 띄운다: 게스트 체험, 세션 만료, 계정 복구, 약관 재동의(`apps/web/app/layout.tsx:67-`).
    - 이 브리지들의 대화상자 문구에 「하루컷」이 들어간다(예: `apps/web/components/guest/GuestTrialBridge.tsx:250,311`).
    - 회원 세션 만료나 약관 재동의 창이 행사 참가 화면 위에 뜰 수 있다.
  - 상태바·테마 색(`viewport.themeColor`)도 전역 값이다.
- 촬영 화면(`/shoot/*`)은 `BrandMark` 나 상단 메뉴를 쓰지 않는다. 그래서 화면 본문의 로고는 적다.
- **필요한 것:** `/e/*`, `/r/*`, 부스 경로는 자체 레이아웃과 `generateMetadata` 를 가져야 한다. 전역 브리지는 그 경로에서 끈다. 행사가 공유 미리보기 이미지를 지정하지 않았을 때 무엇을 보일지(하루컷 OG 로 대체 금지) 정해야 한다.

### 4. 페이지 테마는 기존 토큰을 덮어쓰는 방식이 현실적이다

- 지금 색과 표면은 CSS 변수(`--hc-*`)로 관리한다. `apps/web/app/globals.css` 에 변수 선언이 약 160개 있다. 라이트/다크는 `data-theme` 속성으로 바꾼다(`apps/web/lib/colorTheme.ts:7`).
- 촬영 무대는 자기 색을 따로 칠한다(`useDarkStage`, `apps/web/lib/colorTheme.ts:77` 주석).
- R3 가 정한 범위(템플릿, 디자인 토큰, 정해진 배치 조합, 임의 JS 없음)는 이 구조와 맞는다. 행사 테마를 `--hc-*` 토큰 덮어쓰기 + 정해진 슬롯(배경 이미지, 로고, 문구)으로 정의하면 기존 컴포넌트를 재사용할 수 있다.
- 다만 촬영 무대·카운트다운·결과 화면에는 하드코딩된 색이 섞여 있을 수 있다. 테마를 붙이기 전에 화면별로 토큰화 정도를 점검해야 한다. 이번에는 점검하지 않았다.
- 사용자의 다크 모드 선호와 행사 테마 중 무엇이 이기는지 정해야 한다. 행사 테마가 이기는 것이 자연스럽다.

### 5. 프레임 선택기는 「고정 4종 + 내 프레임」 구조다

- 고정 4종 목록이 프론트 상수다(`apps/web/constants/frames.ts` `FRAME_CONFIGS`). 회원이면 저장한 내 프레임이 더해진다(`apps/web/app/shoot/page.tsx:62` `useMyFrames`).
- 행사 흐름의 선택기는 **서버가 준 허용 목록만** 받아야 한다. 상수 목록이나 내 프레임으로 대체하는 경로를 두면 안 된다(F31·F32).
- 지금 행사 QR 은 `frame=` 쿼리로 레이아웃을 미리 고른다. 행사 흐름에서는 이 쿼리를 받지 않아야 한다(F33). 「하나뿐이면 선택 단계를 생략」(F34)은 서버 목록 길이로 판단한다.
- 행사 프레임의 미리보기는 지금의 원격 프레임 테마 경로(`useRemoteFrameTheme`)를 재사용할 수 있다. 다만 지금은 회원 소유 프레임을 읽는 API 다. 참가자 세션으로 읽는 경로가 따로 필요하다.

### 6. 결과 QR 을 화면에 그리는 코드가 없다

- 지금 QR 은 운영자가 따로 만들어 전달한다. 웹 코드에는 QR 생성 코드나 라이브러리가 없다(`apps/web/package.json` 에 qrcode 계열 없음).
- 부스의 개인 결과 QR(`/r/{token}`)을 띄우려면 QR 생성을 새로 넣어야 한다. 의존성을 추가하거나 직접 구현한다.
- Studio 의 「참가 링크·QR」 화면도 같은 코드를 쓴다.

### 7. 부스 화면 — 전체화면·키오스크 코드가 없다

- `requestFullscreen` 을 쓰는 코드가 없다.
- 유휴 타이머, 원자적 회차 전환, 늦은 응답 무시(활성 회차 id 대조)도 전부 신규다.
- 촬영 흐름의 「늦은 응답 무시」는 카메라에서 이미 비슷한 장치가 있다. `cameraGenerationRef` 로 이전 세대의 비동기 결과를 버린다(`apps/web/app/shoot/capture/_hooks/useCaptureFlow.ts:140-153`). 회차 단위로 같은 방식을 넓히면 된다.

### 8. 엔터프라이즈 소개 문구가 부스와 반대로 말한다

- 기업 소개 화면이 「기계·부스 반입 없이 QR 한 장」을 장점으로 내세운다(`apps/web/components/enterprise/EnterpriseView.tsx:37`, `:62` 「부스 대신 QR 한 장으로」).
- R3 는 현장 부스를 P2 기본으로 넣었다. 부스를 출시할 때 문구를 고쳐야 한다. 여기서 「부스」는 하루컷이 반입하는 기계가 아니라 고객 태블릿·PC 다. 이 구분을 문구에 담아야 한다.

## R3 와 맞는 것 (확인함)

- **카메라 권한 실패 시 갤러리로 대체하지 않는다.** 지금도 권한 거부·미지원이면 안내와 「닫기」만 보인다(`apps/web/app/shoot/capture/_hooks/useCaptureFlow.ts:155-165, 233-241`).
- **인앱 브라우저 → 외부 브라우저 열기**가 이미 있다. 카카오톡·인스타그램·네이버 앱을 감지한다(`apps/web/hooks/useExternalBrowserRedirect.ts:28-68`). R3 의 「지원 브라우저 열기」는 이것을 넓히면 된다.
- **앱 브리지 버전 확인이 이미 있다.** `BRIDGE_VERSION = 2`(`apps/mobile/lib/native-bridge.ts:39`). 웹은 기능별 최소 판 수를 확인한다(`apps/web/lib/nativeBridge.ts:297`, 카메라 권한). R3 12절의 bridgeVersion/capability 검사는 이 장치를 재사용하면 된다. 새로 만들 것이 아니다.
- 일반 비회원은 갤러리 불러오기가 막혀 있다(`apps/web/lib/protectedPaths.ts:33`).
- 촬영 사진은 슬롯 비율로 잘라 쓴다(`useCaptureFlow.ts` 해상도 주석). R3 의 「이번 회차 사진의 선택·재촬영·크롭 허용」과 맞는다.

## R3 에 반영을 요청할 것 (프론트)

우선순위 순이다.

1. **기존 `/shoot?event=` 행사 QR 경로를 제거 대상으로 적는다.** 지금 이 경로는 회원에게 갤러리를 열어 주고, 결과를 개인 보관함에 저장하고, 비회원을 일반 게스트로 만든다. 배포된 QR 이 없으므로 호환하지 않는다(사용자 결정).
2. **부스 초기화 범위에 기기 내 저장소를 명시한다.** 촬영 세션 IndexedDB(출처당 1칸, 「이어 찍기」 제안), `pendingGuestSave`, 게스트 쿠키. 행사 흐름은 `행사·회차` 단위 키를 쓰고 부스에서는 이어 찍기를 끈다.
3. **화이트라벨 범위에 「전역 레이아웃」을 넣는다.** 루트 메타데이터(제목·OG·파비콘·매니페스트)와 전역 브리지 대화상자. 행사 경로는 자체 레이아웃이 필요하다는 점을 P2B 작업으로 적는다.
4. **행사 프레임 선택기는 서버 목록만 쓴다**는 프론트 조건을 F31 옆에 적는다. 상수 4종·내 프레임·`frame` 쿼리를 행사 흐름에서 빼야 한다.
5. **결과 QR 생성과 부스 전체화면은 신규 프론트 작업**으로 P2B 에 넣는다.
6. **bridgeVersion 은 이미 있다**(`BRIDGE_VERSION = 2`). R3 12절 문구를 「기존 판 수 확인 장치를 구매·복원까지 넓힌다」로 고친다.
7. **엔터프라이즈 소개 문구 수정**을 부스 출시 체크리스트에 넣는다.

## 사용자 결정 (2026-10-26)

| 질문 | 결정 | 기획서에 반영할 것 |
| --- | --- | --- |
| 이미 배포한 `/shoot?event=` QR 이 있는가 | **없다.** 아직 서비스를 운영하지 않는다. | 옛 행사 QR 호환은 고려하지 않는다. `/shoot` 의 `event` 쿼리와 행사 배너는 `/e/{slug}` 가 생기면 걷어낸다. 반영 요청 1번은 「호환 방침」이 아니라 「제거」로 바꾼다. |
| 부스 기기를 정하는가 | **정하지 않는다.** 고객이 원하는 기기를 알아서 쓴다. | 「지원 기기 목록」을 「지원 조건」으로 바꾼다. 조건은 HTTPS, `getUserMedia` 가 되는 최신 브라우저, 카메라다. 22절 「부스 지원 기기 목록」은 확정할 값에서 뺀다. P2C 검수는 대표 조합(iPad Safari, 안드로이드 Chrome, PC Chrome)으로 하고, 이를 보장 목록이 아니라 확인한 조합으로 적는다. 전체화면을 지원하지 않는 기기(iPhone Safari 등)에서도 부스 흐름이 동작해야 한다. |
| 다크 모드와 행사 테마 | **행사 테마가 우선이다.** 하루컷 자체 화면도 테마 하나로 줄여도 된다. | 행사 화면은 사용자의 다크 모드 설정을 무시하고 행사 테마 하나만 쓴다. 하루컷 기본 화면을 라이트 하나로 줄이면 검수 대상이 절반이 된다. 단, 다크 모드 제거는 별도 작업이다(`apps/web/lib/colorTheme.ts`, `ColorThemeScript`, 마이페이지 설정, `viewport.themeColor`, 앱 상태바 색). |

## 백엔드 검수

> **2026-10-26 정정:** 이 절은 하루컷 백엔드 세션이 아니라 하루컷이 아닌 다른 프로젝트의 백엔드 세션이 Harucut 저장소 파일을 읽고 낸 결과다. 하루컷 백엔드 세션의 판정은 `docs/plan-review-r4-verdict-2026-10-26.md` 에 있다. 둘이 다르면 그 문서를 따른다.

백엔드 세션이 백엔드 저장소(`popeye0618/Harucut`, 커밋 8bab406) 코드만 보고 검수했다. 코드, AWS, 운영 DB 는 건드리지 않았다.
경로는 따로 표시가 없으면 `src/main/java/com/harucut/` 기준이다.

### 지난 검수 정정 — Lambda 동시성

- 지난 검수는 「Lambda 예약 동시성 30」이라고 적었다. 근거는 `docs/adr-0001:46` 이었다.
- 그런데 `docs/measurement-2026-08-23.md:59-65` 는 다르게 적었다. 계정 동시 실행 한도가 10(신규 계정 기본값)이라 예약 동시성을 걸 수조차 없다.
- 두 문서가 서로 어긋난다. R3 의 「30 은 재확인」 판단이 맞다. 한도가 실제로 10 이면 Service Quotas 증설 요청이 P2 의 선결 조건이다.

### 판정

| # | R3 주장 | 판정 | 요점 |
| --- | --- | --- | --- |
| 1 | 인증 주체 3종(participant·booth·결과 토큰)을 로그인 JWT 와 분리 | 맞음. 단 필터 체인을 따로 둬야 함 | ①~④ |
| 2 | (idempotency_scope, idempotency_key) 유니크. user_id 를 nullable 로만 바꾸지 않음 | 맞음. 전환 순서 보완 | ⑤ |
| 3 | uploadIntent 4용도. 행사 job 은 이번 회차 CAPTURE_INPUT 만 받음 | 맞음. 보완 2개 | ⑥ |
| 4 | 검증 뒤 덮어쓰기 방지 | 맞음. 더 싼 방법 있음 | ⑦ |
| 5 | 부스 늦은 응답은 활성 회차 id·상태 버전으로 거름 | 맞음. 결과 소비자는 그대로 두고 조회 쪽을 바꿈 | ⑧ |
| 6 | 시도 식별자, dispatch_attempts, nextAttemptAt, 총 기한 | 맞음. 필요함 | ⑨ |
| 7 | UsageLedger 예약을 PENDING 저장과 같은 트랜잭션에 | 맞음. 보완 | ⑩ |
| 8 | baseline-on-migrate 를 운영 기본값으로 쓰지 않음 | **R3 가 맞음.** 지난번 우리 권고를 고침 | ⑪ |
| 9 | 동의 기록은 terms_agreement 재사용 + Participant FK | 보완. 약관 원문만 재사용하고 동의 행은 새 테이블로 | ⑫ |
| 10 | 결과 토큰 해시 저장, 짧은 presigned, 첫 스캔에 폐기 안 함 | 맞음. 보완 | ⑬ |
| 11 | Lambda 30 재확인, 18건 429 재현, 1~2GB 는 후보, Redis 64MB 로 수용 인원 계산 불가 | 대체로 맞음. 「429 재현」은 측정 대상을 바꿀 것 | ⑭ |
| 추가 | 허용 목록 서버 강제 | R3 에 서버 쪽 강제 지점이 빠짐 | ⑮ |
| 추가 | CAMERA_ONLY 우회 경로 | R3 가 다루지 않음 | ⑯ |

### 상세

**① 체인을 나눠야 하는 이유**

- `auth/security/JwtAuthenticationFilter.java:40-51, 86-89` 가 모든 요청에서 accessToken 쿠키를 먼저 본다. 토큰이 만료·위조이고 경로가 PUBLIC 이 아니면 401 로 끊는다(`:75-84`).
  - 행사장에 온 회원은 하루컷 쿠키를 들고 있다. 그래서 participant 토큰이 유효해도, 로그인 쿠키가 만료됐으면 `/api/participant/**` 가 401 이 된다.
- 메인 체인의 끝은 `anyRequest().hasAnyRole("USER","ADMIN")` 이다(`config/SecurityConfig.java:84`). ROLE_PARTICIPANT 나 ROLE_BOOTH 를 넣어도 여기서 403 이다.

**② 붙이는 방법**

- 메인보다 `@Order` 가 앞서는 SecurityFilterChain 을 하나 더 둔다(주체별로 셋을 둬도 된다).
  - `securityMatcher("/api/participant/**", "/api/booth/**", "/api/public/**")`
  - STATELESS. oauth2Login 과 JwtAuthenticationFilter 는 넣지 않는다. 주체별 전용 필터와 authorizeHttpRequests 를 따로 둔다.
- 페어링 redeem 과 결과 다운로드는 이 체인 안에서 permitAll 로 연다. 자격 증명은 코드와 토큰 자체다.
- 새 필터는 `@Component` 가 아니라 `new` 로 만들어 체인에만 붙인다. 지금 JwtAuthenticationFilter 가 그렇게 돼 있다(`SecurityConfig.java:68-71`). `@Component` 로 만들면 서블릿 필터로 전역 등록된다.
- 회원 참가자는 participant 를 발급할 때 쿠키를 읽어 user_id 를 기록한다. 요청마다 두 인증을 섞지 않는다.

**③ SecurityPaths 와 OpenAPI 에 미치는 영향**

- PUBLIC 배열은 세 곳에 함께 쓰인다.
  - 메인 체인의 permitAll(`SecurityConfig.java:82`)
  - JWT 실패를 무시하는 매처(`SecurityPaths.java:68-73`)
  - 문서의 자물쇠 표시(`config/openapi/ApiErrorDocumentationCustomizer.java:72-80`)
- 그래서 새 경로를 어느 쪽에 두든 문서가 틀린다.
  - PUBLIC 에 넣으면 문서에 「인증 없음」으로 나온다.
  - 빼면 cookieAuth 와 「탈퇴 요청·정지」 403 이 붙는다(`:108-130`).
- 할 일
  - SecurityPaths 에 PARTICIPANT·BOOTH·RESULT_TOKEN 범주를 추가한다.
  - OpenApiConfig 에 보안 스킴 3개를 추가한다.
  - 커스터마이저가 범주별로 스킴과 오류 목록을 고르게 한다.
  - 관련 테스트 3종에 회귀 케이스를 추가한다.
- 문서 그룹: userApi 는 `/api/**` 에서 admin·webhook 만 뺀다(`OpenApiConfig.java:106-114`).
  - 그래서 새 경로는 모두 「1-user」 그룹에 들어간다. 프론트 계약 CI 에도 잡힌다.
  - 부스 API 를 따로 볼지(예: 「4-booth」 그룹)는 프론트가 정한다.

**④ 시도 제한**

- 페어링 redeem 과 결과 토큰 조회는 추측 공격의 대상이다.
- 지금 시도 제한은 이메일에만 있다(`auth/email/EmailRateLimit.java`). 같은 Redis 카운터 방식을 두 경로에도 붙인다.
- 페어링 코드의 길이와 만료(예: 10분, 1회용)를 R3 에 수치로 적을 것.

**⑤ 멱등 전환**

- 현재
  - `uk_compose_job_user_idempotency (user_id, idempotency_key)`(`media/entity/ComposeJob.java:32-34`). user_id 는 NOT NULL 이다.
  - MySQL 유니크는 NULL 끼리를 다른 값으로 본다. user_id 를 nullable 로만 바꾸면 비회원 job 이 같은 key 로 몇 번이든 들어간다.
- 순서(Flyway 가 먼저 있어야 한다. ddl-auto update 는 제약을 지우거나 바꾸지 않는다)
  1. `idempotency_scope` 컬럼을 추가하고 `U:{user_id}` 로 백필한다.
  2. NOT NULL 로 바꾸고 `UNIQUE(idempotency_scope, idempotency_key)` 를 추가한다.
  3. **`ADD INDEX(user_id)` 를 먼저 한 뒤** 옛 유니크를 지운다. FK 가 옛 유니크를 인덱스로 쓰고 있으면 DROP 이 실패한다. 운영 인덱스 이름은 SHOW INDEX 로 확인한다.
  4. 코드를 scope 기준 조회로 바꾼 뒤 user_id 를 nullable 로 바꾸고 participant_id 를 추가한다.
- scope 형식은 주체 기준이다: `U:{userId}` / `P:{participantId}` / `B:{deviceId}`.

**⑥ uploadIntent 와 원본 검사**

- 현재
  - presign API 는 `/api/auth/user/files/presigned-upload` 하나뿐이고 publicId 가 필수다(`storage/controller/FileController.java:23, 50-57`).
  - 원본 검사는 키 접두사만 본다(`ComposeService.java:179-189`).
- 바꿀 것
  - (a) 키 생성 전략을 주체 기준으로 바꾼다. 행사 키 예: `uploads/events/{eventId}/runs/{runId}/captures/{uuid}`.
  - (b) 접두사 대신 upload_intent 행(주체, run_id, 용도, key, 상태)으로 판정한다. 「이번 회차의 CAPTURE_INPUT」은 키 문자열만으로 증명할 수 없다.
  - (c) intent 는 한 번만 소비한다. 지금은 같은 원본을 여러 job 에 넣을 수 있다. 먼저 성공한 job 이 원본을 지우면 나머지는 실패한다(`ComposeService.java:113-115`).
  - (d) 접수할 때 HeadObject 로 객체가 있는지 확인한다. 지금은 올리지 않은 key 도 202 를 받는다.
- 용도 대응
  - CAPTURE_INPUT ≈ FOURCUT_SOURCE, FRAME_ASSET ≈ FRAME·FRAME_COMPONENT.
  - TEXT_RENDER·PAGE_THEME_ASSET 은 신규다.
  - PROFILE 은 유지한다고 R3 에 적을 것.

**⑦ 덮어쓰기 방지 — 지금 구조로는 막히지 않는다**

- presign PUT 은 24시간 유효하다. 서명에 들어가는 것은 Content-Type 과 Content-Length 뿐이다(`storage/service/S3FileStorageService.java:28, 55-60`).
  - 그래서 24시간 안에 크기가 같은 다른 파일로 덮어쓸 수 있다.
  - 버킷 versioning 은 코드에도 문서에도 없다.
- 권장 순서
  1. **조건부 쓰기:** presign 에 `If-None-Match: *` 를 서명한다. 같은 key 에 두 번째 PUT 이 오면 S3 가 412 로 거절한다. 다만 지금 SDK 2.25.67(`build.gradle:54`)에는 이 옵션이 없어 서버 SDK 를 올려야 한다.
  2. 대안: 검증할 때 CopyObject 로 다른 key 에 옮긴다. 복사 비용과 지울 대상이 두 배가 된다.
  3. versioning + versionId 전달: 가장 무겁다. Lambda 페이로드와 삭제 처리를 모두 바꿔야 한다.
- 행사용 PUT 만료는 24시간과 따로, 분 단위로 짧게 둔다.

**⑧ 부스 늦은 응답**

- 결과 소비자는 jobId 단위로 그 job 만 끝낸다. 화면으로 밀어 넣는 경로가 없고 진행 상황은 폴링으로 받는다(`media/compose/ComposeResultConsumer.java:166-200`). 그래서 소비자는 그대로 둬도 된다.
- 늦게 끝난 이전 회차 job 도 정상 완료돼야 한다. 이전 손님이 QR 로 받을 결과다.
- 바꿀 곳은 조회 쪽이다.
  - job 에 `capture_run_id` 를 추가한다.
  - 부스 조회 API 는 「기기의 활성 회차 + 상태 버전」으로만 답한다. 예: `GET /api/booth/runs/current?version=N`.
  - 기기가 jobId 로 직접 조회하는 경로는 막는다.

**⑨ 시도 식별 — 필요하다**

- 지금은 재투입이 started_at 리스만 쓴다. 시도 번호가 없고, fail 은 PENDING 이면 무조건 반영된다(`ComposeJob.java:128-135`).
- 실제로 깨지는 장면
  1. DB 장애 등으로 통지 처리가 10분 넘게 실패한다. 재실행 배치가 2차 시도를 던진다.
  2. 그 사이 밀려 있던 1차 시도의 실패 통지가 처리돼 job 이 FAILED 가 된다.
  3. 2차 시도의 성공 통지는 상태가 PENDING 이 아니라서 무시된다.
  4. 결과 파일은 S3 에 있는데 미디어 행이 없는 고아가 된다. 사용자는 실패 화면을 본다.
- 고칠 것
  - 재투입할 때 `attempt_no` 를 함께 올린다. Lambda 페이로드에 attemptNo 를 싣는다. Destination 통지로 그대로 돌아온다.
  - **fail 은 attemptNo 가 현재 시도와 같을 때만 반영한다.** 성공은 어느 시도든 받는다. 결과 key 가 job 마다 하나로 정해져 있기 때문이다.
  - 백오프, 시도 상한, 총 기한을 둔다. 넘으면 FAILED 로 확정하고 사용량을 돌려준다.
- 배포는 Lambda 를 먼저 한다. 페이로드가 compose-core 공유 record 이기 때문이다.
- Lambda 쪽 한계도 R3 에 적을 것: event age 300초, 재시도 2회(`compose-lambda/README.md:91-92`).

**⑩ UsageLedger**

- 합성 접수(requestCompose)는 한 트랜잭션이다(`ComposeService.java:52-84`). 그래서 예약을 같은 트랜잭션에 넣는 것이 맞다.
- 보완
  - (a) `complete`/`fail` 이 아무것도 돌려주지 않는다(void). 그래서 상태가 실제로 바뀌었는지 알 수 없다. boolean 을 돌려줘야 확정·환불을 정확히 한 번만 할 수 있다.
  - (b) 원자 차감은 조건부 UPDATE 2개로 한다(`SET used = used + 1 WHERE id = ? AND used + 1 <= quota`).
    - 교착을 막으려고 잠금 순서를 「기업 → 행사」로 고정한다.
    - 영향받은 행이 0개면 한도 초과다.
  - (c) 원장 행에는 `(job_id, kind)` 유니크를 건다. 예약·확정·환불이 각각 한 번만 들어간다.

**⑪ Flyway — R3 가 맞다**

- `baseline-on-migrate=true` 는 히스토리 테이블이 없는 스키마를 만나면 조용히 baseline 을 찍는다. 덤프를 반쯤 넣은 스테이징 같은 잘못된 DB 에도 그냥 통과한다.
- 고친 권고
  1. 운영 스키마를 `mysqldump --no-data` 로 받아 V1 을 만든다. 로컬과 스테이징은 V1 부터 실행한다.
  2. 운영은 배포 전에 사람이 `flyway baseline -baselineVersion=1` 을 한 번 실행한다. 운영 설정의 `baseline-on-migrate` 는 false 로 둔다.
  3. 같은 릴리스에서 ddl-auto 를 update → validate 로 바꾼다(`src/main/resources/application-prod.yaml:10`).
- 테스트 프로파일은 create-drop 이라 마이그레이션을 검증하지 않는다(`application-test.yaml:8`). Flyway 로 띄워 validate 하는 테스트가 하나 필요하다.

**⑫ 동의 기록**

- `terms_agreement.user_id` 는 NOT NULL 이고, `UNIQUE(user_id, terms_id)` 로 최신 동의 한 행만 남긴다(`terms/entity/TermsAgreement.java:10-27`). 이력에는 약관 버전 FK, 채널, 행사 버전이 없다.
- 권장
  - 약관 원문(terms·terms_version)만 재사용한다.
  - `participant_consent` 를 새로 만든다. 덧붙여 쌓기만 하는 테이블이다. 컬럼은 participant_id FK, terms_version_id, agreed, agreed_at, event_experience_version_id.
  - 회원 참가자는 participant.user_id(nullable)로 잇는다.

**⑬ 결과 토큰**

- presign GET 도 PUT 과 같은 24시간 상수를 쓴다(`S3FileStorageService.java:28, 80-116`). 짧은 URL 을 주려면 만료를 인자로 받게 바꿔야 한다.
- 토큰이 충분히 긴 난수면 SHA-256 해시와 인덱스 조회로 충분하다.
- 첫 스캔에 폐기하지 않는 것이 맞다. 카카오톡 같은 링크 미리보기 크롤러가 먼저 연다.
- 덧붙일 것
  - `/r/{token}` 에 `Referrer-Policy: no-referrer` 를 건다.
  - 접근 로그에서 토큰을 가린다.
  - 시도 제한(④)을 붙인다.
  - 만료·폐기 정책을 정한다.

**⑭ 운영 수치**

- 「18건 429 재현」은 측정 대상을 바꿔야 한다.
  - 그 429 는 예전 동기 호출에서 났다. 지금 비동기 호출은 같은 조건에서 30건 모두 성공했다(`measurement-2026-08-23.md:12-21`).
  - 재현해도 실패는 안 나온다. 재야 할 것은 대기 시간이다.
- 대략 계산(실측 아님)
  - 동시 10건 × 건당 약 8.3초면 처리량은 약 1.2건/초(분당 약 72건)다.
  - 약 360건 넘게 밀리면 event age 300초를 넘긴다. 그 뒤로는 10분 뒤 재투입이라 손님 대기가 10분을 넘는다.
  - JPEG 개선 뒤 렌더 시간이 약 39% 줄었다는 예측이 있다(`perf-10k-dau.md:211`). 현재 값으로 다시 잴 것.
- Redis 64MB: noeviction 이라 꽉 차면 쓰기가 실패한다. 행사 기능만이 아니라 refresh 회전과 로그인도 함께 죽는다. 참가자 세션은 Redis 대신 서명 토큰 + DB 행으로 두기를 권한다.

**⑮ 허용 목록 서버 강제 (R3 에 추가 필요)**

- `frame/service/FrameService.java:68-75` 의 `getComposableFrame` 은 시스템 프레임을 누구에게나 통과시킨다. 행사 job 이 이 경로를 재사용하면 「SYSTEM 도 목록에 있어야 보인다」가 서버에서 깨진다.
- 행사 job 접수 때 검사할 것
  - frameVersionId 가 발행본의 allowedFrameVersionIds 안에 있는가.
  - layoutType 이 allowedLayoutTypes 안에 있는가.
  - 목록이 비었으면 거부한다.
- job 에 event_experience_version_id, frame_version_id, capture_run_id 를 남긴다.
- 배경색 같은 편집 값도 발행본의 편집 정책으로 검사한다. 지금은 요청값을 그대로 쓴다(`ComposeService.java:71`).

**⑯ CAMERA_ONLY 우회 경로 (R3 에 추가 필요)**

- 서버가 촬영 진위를 증명할 수 없다는 R3 의 명시는 맞다. 그래도 갤러리 사진을 넣는 정식 경로를 서버가 열어 두면 안 된다.
- PHOTO 레이어, STICKER, TEXT_RENDER 는 모두 임의 이미지를 올릴 수 있는 길이다. 렌더러에게 PHOTO 와 STICKER 는 같은 Layer 다(`media/compose/ComposeSpecAssembler.java:20-60`).
- R3 에서 둘 중 하나를 정할 것.
  - 참가자는 PHOTO·STICKER 를 올리지 못하게 막는다.
  - TEXT_RENDER 에 크기·용량 상한을 두거나, 글자를 Lambda 가 직접 렌더한다.

### 백엔드: R3 에 반영을 요청할 것 (우선순위 순)

1. 참가자·부스·결과 토큰은 별도 SecurityFilterChain 으로 처리한다(①②). PUBLIC 에 추가하는 것만으로는 회원 쿠키가 만료됐을 때 401, 역할 검사에서 403 이 난다. OpenAPI 범주와 스킴도 추가한다(③).
2. 허용 목록과 편집 정책은 접수 API 에서 서버가 강제한다. 시스템 프레임 우회를 막고, job 에 발행본·회차 id 를 남긴다(⑮).
3. CAMERA_ONLY 우회 경로를 정한다: PHOTO·STICKER·TEXT_RENDER(⑯).
4. 덮어쓰기는 조건부 presign(`If-None-Match`)과 SDK 상향으로 막는다. 행사용 PUT·GET 만료를 24시간과 분리한다. 접수 때 HeadObject 로 확인하고 intent 는 한 번만 소비한다(⑥⑦).
5. 시도 번호를 재투입·페이로드·fail 조건에 넣는다. complete/fail 은 상태가 바뀌었는지 돌려준다. 상한·기한을 넘으면 FAILED 로 확정하고 환불한다. Lambda 를 먼저 배포한다(⑨⑩).
6. Lambda 계정 동시 실행 한도를 실제로 확인하고 증설을 요청한다. 「429 재현」 대신 목표 동시 인원에서의 대기 시간을 잰다(⑭).
7. Flyway 는 V1 덤프, 명시적 baseline, validate 전환을 같은 릴리스에 넣는다(⑪). 멱등 전환(⑤)은 그 뒤에 하고, FK 인덱스를 먼저 추가한다.
8. 동의는 `participant_consent` 새 테이블로 한다. 약관 원문만 재사용한다(⑫).
9. 부스 화면은 「활성 회차 + 상태 버전」 조회 API 로만 상태를 받는다(⑧).
10. 결과 토큰과 페어링 코드에 시도 제한, 만료, Referrer-Policy 를 둔다(④⑬).

## 참고

- 지난 검수(R1 대상, 백엔드 1/3~3/3 포함): `docs/plan-review-2026-10-25.md`.
- 프론트 규칙 원본: `AGENTS.md`. 문서 지도: `docs/README.md`.
