# 고도화 기획서 검수 — 프론트

2026-10-25 · 대상: 「하루컷 제품 고도화 기획서」(2026-10-25 기준판)

- 기획서를 프론트 저장소(`harucut_FE`) 코드와 대조했다. 코드는 고치지 않았다.
- 백엔드 부분은 백엔드 세션이 따로 검수했다(아래 「백엔드 검수」 1/3~3/3).
- 기획서에 바로 반영할 것만 보려면 맨 끝 「기획서에 반영을 요청할 것」 절을 본다.
- 근거는 `file:line` 으로 적었다. 경로는 저장소 루트 기준이다.

## 총평

- 방향은 현황 문서(S1)와 맞는다.
- 현재 문제를 제대로 짚었다: 스티커, 약관 0건, 단일 EC2, refresh 세션 1개, 결제 mock.
- 「현재 구현」과 「제안」을 구분해 적었다.
- 다만 프론트 코드를 직접 보지 않아서, 아래처럼 틀리거나 빠진 곳이 있다.

## 기획서가 틀리게 본 것

| 기획서 내용 | 실제 코드 |
| --- | --- |
| 배경 이미지 편집을 P1 에서 새로 만든다 | **이미 있다.** 배경 이미지 업로드와 불투명도를 지원한다(`apps/web/components/theme/editor/BackgroundPanel.tsx`, `apps/web/lib/frameApi.ts:109-115`). 없는 것은 채우기(cover)·맞춤(contain)·위치 조절이다. |
| 기존 PHOTO enum 이 사진 칸인지 이미지 레이어인지 확인이 필요하다 | **사용자가 올린 이미지 레이어다**(`apps/web/components/theme/editor/AssetPanel.tsx:248`). 사진 칸은 컴포넌트가 아니다. 프레임 종류 4개(CLASSIC/WIDE/GRID/POLAROID)마다 고정 좌표로 정해진다(`apps/web/constants/frameLayouts.ts`). |
| 편집기에 잠금이 있다 | 편집 화면 안에서만 잠긴다. 저장 요청에 `locked` 를 싣지 않아 서버에 남지 않는다(`apps/web/lib/frameApi.ts:182-195`). |
| 되돌리기와 다시 실행 | 일반 undo/redo 는 없다. 「방금 지운 레이어 되살리기」 하나뿐이다(`apps/web/lib/themeEditorStore.ts:194-198`). |
| 자동 저장 | 브라우저 localStorage 에만 남긴다(`apps/web/lib/themeEditorStore.ts:212`). 서버 초안은 없다. |

## 기획서가 빠뜨린 프론트 제약

### 1. 비회원 업로드는 약관이 막는다

- 검수 시나리오 3(게스트가 행사에서 촬영 또는 업로드)은 현재 약관과 충돌한다.
- 약관 제8조가 비회원 범위를 「사진 촬영, 이미지 다운로드」로 정한다.
- 그래서 `/shoot/upload` 는 회원 전용이다(`apps/web/lib/protectedPaths.ts:33`). 테스트도 이 규칙을 고정한다(`packages/shared/src/guest-trial.test.ts:67`).
- 행사 참가자 업로드를 열려면 약관 개정이 먼저다. 약관과 화면 문구도 함께 바꿔야 한다.

### 2. 비회원 결과물을 서버에 남기는 길이 없다

- 비회원 완성본은 브라우저가 그린다(`apps/web/lib/canvas/composeFrame.ts`).
- 완성본을 서버에 등록하는 API 는 없어졌다(405). 근거는 `apps/web/lib/pendingGuestSave.ts` 머리 주석이다.
- 지금 비회원 원본은 로그인 뒤 옮기려고 IndexedDB 에만 보관한다.
- P2 의 「비회원 서버 합성 + 개인 결과 링크」는 두 가지가 필요하다.
  - 백엔드: 참가자 세션 기반의 새 업로드·합성 API.
  - 프론트: 촬영 흐름을 다시 짜기.

### 3. 사진 칸 편집(크기·간격·모양)은 큰 공사다

- 칸 좌표는 프론트 상수(`FRAME_LAYOUTS`)에 고정돼 있다.
- 합성 엔진도 4가지 프레임 종류(`frameType`)만 안다.
- 칸 편집을 넣으려면 FrameSpec, 합성 엔진(compose-core), 편집기를 함께 바꿔야 한다.
- 「배경 이미지」와는 난이도가 다르다. 따로 단계를 잡는 것이 맞다.

### 4. 글자는 브라우저가 PNG 로 구워 보낸다

- TEXT 레이어는 브라우저가 투명 PNG 로 구워 `renderedKey` 로 보낸다(`apps/web/lib/frameApi.ts:27-30`, `apps/web/lib/canvas/textLayer.ts`).
- 서버는 글자를 그리지 않는다. `renderedKey` 가 없으면 합성이 400 GEN-002 로 실패한다.
- 행사 참가자가 문구를 바꾸게 하려면 둘 중 하나다.
  - 참가자 기기에서 굽는다.
  - 서버에 한글 폰트 렌더러를 새로 넣는다. 폰트 라이선스 확인이 따라온다.

### 5. 새 화면마다 연결 작업이 따라온다

- 브라우저는 백엔드를 직접 부르지 않는다. 항상 Next 프록시 `/api/client/*` 를 거친다. 지금 핸들러는 37개다.
- 새 API 를 쓰려면 프록시 핸들러를 하나씩 추가해야 한다.
- `/e/slug`, `/r/token`, `/studio`, `/admin` 은 `apps/web/proxy.ts` 의 경로 판정 규칙에도 넣어야 한다.
  - 지금 비회원 허용 경로는 `/shoot` 하나뿐이다(`apps/web/lib/protectedPaths.ts:21`).
  - `/e` 와 `/r` 은 비회원이 들어오는 경로라 규칙을 새로 정해야 한다.

### 6. 앱 인앱 결제는 앱 셸 원칙(ADR-0003)을 넓히는 일이다

- 앱은 웹을 띄우는 WebView 셸이다. 네이티브가 맡는 일은 8가지로 정해져 있다(`docs/mobile-shell.md`).
- 인앱 결제는 9번째 일이 된다.
- 브리지 한 쌍 `apps/web/lib/nativeBridge.ts` ↔ `apps/mobile/lib/native-bridge.ts` 를 같은 커밋에서 함께 고쳐야 한다. `docs/mobile-shell.md` 표도 바꿔야 한다.
- `harucut://` 딥링크는 scheme 만 등록됐고 구현은 없다. 기획서의 앱 소셜 로그인(시스템 브라우저 + 일회용 코드)은 이 구현을 전제로 한다.

### 7. 배경 제거는 전부 브라우저에서 돈다. 모델이 둘이다

- 촬영 칸별 누끼: MediaPipe `selfie_segmenter`(`@mediapipe/tasks-vision`, `apps/web/lib/canvas/personCutout.ts`).
  - 검은 배경 JPEG 으로 구워 올린다. 서버는 누끼를 그리지 않는다.
- 편집기 에셋 배경 제거: `@imgly/background-removal`(AGPL, `apps/web/lib/backgroundRemoval.ts`).
- 기획서가 P0 에서 검토하자고 한 AGPL 문제는 **편집기 에셋 쪽에만** 해당한다. 촬영 누끼는 관계없다.
- 비회원 합성을 서버로 옮겨도 누끼는 지금처럼 브라우저에서 구워 올리는 방식을 유지할 수 있다.

## 기획서와 맞는 것 (확인함)

- 결제 화면은 닫혀 있다(`packages/shared/src/company.ts:44` `PAYMENTS_ENABLED = false`).
- 행사 QR 은 `/shoot?frame=...&event=행사이름` 으로 들어온다. 행사 이름은 화면 표시용으로만 쓴다(`apps/web/app/shoot/page.tsx:56-59`). 서버에는 행사라는 개념이 없다.
- 스티커 문제: 다시 불러온 프레임에서 스티커 주소가 key 그대로 온다. 프론트는 `https` 일 때만 렌더 주소를 쓴다(`apps/web/lib/frameApi.ts:220-221`).
- 운영 약관이 0건이라 이메일 회원가입이 막혀 있다(`apps/web/app/signup/page.tsx:199`). 소셜 로그인은 약관과 무관하게 열려 있다.

## 백엔드 검수

> **2026-10-26 정정:** 이 절은 하루컷 백엔드 세션이 아니라 하루컷이 아닌 다른 프로젝트의 백엔드 세션이 Harucut 저장소 파일을 읽고 낸 결과다. 하루컷 백엔드 세션의 판정은 `docs/plan-review-r4-verdict-2026-10-26.md` 에 있다. 둘이 다르면 그 문서를 따른다.

백엔드 세션이 백엔드 저장소(`popeye0618/Harucut`, 커밋 8bab406) 코드만 보고 검수했다. 실행과 수정은 하지 않았다.
경로는 따로 표시가 없으면 `src/main/java/com/harucut/` 기준이다.

### 핵심

- **비회원 참가자를 받는 데 가장 큰 벽은 기획서에 빠져 있다.** 합성, 업로드, 보관함 전 구간이 「로그인한 User」를 전제로 만들어져 있다(자세한 내용은 아래 2/3).
- 기획서가 틀리게 이해한 것:
  - 합성 재시도: 전부 무제한이 아니다. 일부 경우만 무제한이다.
  - PHOTO: 사진 슬롯이 아니라 이미지 레이어다(프론트 결론과 같다).
  - 한도: 합성 횟수 한도가 아니다. 프레임 개수와 보관 기간 한도다.
  - 약관 동의: 소셜 가입뿐 아니라 이메일 가입도 서버가 강제하지 않는다.

### 1/3 — 현재 상태 항목

| # | 기획서 주장 | 판정 | 근거와 덧붙일 점 |
| --- | --- | --- | --- |
| 1 | 운영 ddl-auto update, Flyway 없음 | 맞음 | `src/main/resources/application-prod.yaml:10`, `build.gradle` 에 flyway 없음. `media/entity/ComposeJob.java:27` 주석은 「운영은 none」이라 실제와 어긋난다. update 는 새 테이블에만 인덱스를 만들므로 **Flyway baseline 은 운영의 실제 인덱스를 덤프해서 잡아야 한다.** |
| 2 | 합성 무제한 재시도 | 반만 맞음 | 함수가 예외로 끝나면 유한하다. Lambda 비동기 호출은 기본 3회(최초 1 + 재시도 2)이고, RetriesExhausted 가 오면 FAILED 로 확정한다(`media/compose/ComposeResultConsumer.java:185`). 무제한인 것은 스로틀(`:198`), Lambda 접수 실패, 통지 유실의 세 경우다. 이때 PENDING 으로 남고 10분 뒤부터 30초마다 다시 던진다. 시도 횟수를 세는 컬럼은 없다(`media/batch/ComposeRerunScheduler.java`). |
| 2 | 실패 원본 미정리 | 맞음 | 원본은 성공했을 때만 지운다(`media/service/ComposeService.java:115`). 실패 처리(`:118`)는 상태만 바꾼다. presign 만 받고 합성까지 가지 않은 원본을 정리하는 배치도 없다. |
| 3 | spec_json 8,000자 | 맞음 | `ComposeJob.java:76`. **빠진 점:** 컴포넌트 개수에 상한이 없다. 레이어가 대략 40~50개를 넘으면 400 이 아니라 DB 오류(500)로 죽는다. FrameVersion 을 설계할 때 개수 상한과 컬럼 타입(TEXT/JSON)을 함께 정해야 한다. |
| 4 | 역할 USER/ADMIN | 맞음 | `user/enums/UserRole.java:4`. 역할은 전역에 하나뿐이다. 사용자 상태에서 권한이 따로 나온다: DELETED_REQUESTED 는 전용 권한을 받고, BLOCKED·DELETED 는 권한이 없다(`auth/security/AuthenticatedUser.java:28`). 공간 단위 역할(Membership)은 개념이 없다. |
| 5 | 관리자 API 일부만 있음 | 맞음 | 있는 것: terms, frames, coupons, notices, subscriptions(조회만). 없는 것: 사용자 역할·상태 변경, 미디어, 합성 Job, 결제·환불. **위험:** 관리자 보호가 URL 규칙이 아니라 컨트롤러마다 붙인 `@PreAuthorize("hasRole('ADMIN')")` 다. `config/SecurityConfig.java:84` 에서 `/api/admin/**` 는 USER 도 통과한다. CMS API 를 늘리다 애노테이션 하나만 빠뜨려도 일반 사용자에게 열린다. CMS 확장 전에 `/api/admin/**` 에 URL 단위로 ADMIN 을 걸 것을 권한다. |
| 6 | 결제 mock 게이트웨이 | 맞음 | `payment/gateway/MockPaymentGateway.java:16`(provider 기본값이 mock). 웹훅 처리는 로그만 남기는 껍데기다(`payment/webhook/WebhookService.java:10`). |
| 7 | 02시 PG 갱신 배치 | 맞음 | `payment/batch/SubscriptionRenewalScheduler.java:25`(02:00). 만료 배치는 `SubscriptionExpirationScheduler.java:26`(02:30), 탈퇴 배치는 01:00 이다. |
| 8 | refresh 세션 사용자당 1개 | 맞음 | `auth/service/RefreshTokenRepository.java`. 키가 `REFRESH_TOKEN:USER:{publicId}` 하나다. 재사용이 탐지되면 그 유일한 세션을 지운다(`refresh-rotate.lua`). |
| 9 | 3,900원/9,900원 코드 기본값, 한도 임시 무제한 | 숫자는 맞음, 한도 해석은 틀림 | 가격은 `subscription/config/PlanPricingProperties.java:10-11` 의 `@DefaultValue` 다. yaml 에 `billing.pricing` 이 없어서 이 값이 그대로 쓰인다. 한도는 `subscription/enums/PlanTier.java:14-17` 에 정의돼 있고, 프레임 개수와 보관 기간 두 가지뿐이다. **합성 횟수 한도는 개념이 없다.** 합성 요청은 사용량을 세지 않는다. 그래서 UsageLedger 는 확장이 아니라 신규다. |
| 10 | 소셜 가입에서 서버가 약관 동의를 강제하지 않음 | 맞지만 범위가 좁음 | 이메일 가입(`auth/service/RegisterService.java:15`)과 소셜 가입(`auth/oauth2/SocialLoginService.java:51`) 모두 서버가 약관을 검사하지 않는다. 동의하지 않은 사용자를 막는 필터도 없다. 운영에서 이메일 가입이 막힌 것은 프론트 가입 화면이 약관 목록을 기다리기 때문이다. 서버가 막는 것이 아니다. **ConsentRecord 에 「서버가 강제한다」를 새 요구사항으로 넣어야 한다.** |
| 11 | 스티커 소유권 검사 없음, 주소 변환·삭제 누락 | 맞음 | `frame/service/FrameAssetManager.java:28·46` 이 PHOTO 만 처리한다. `frame/service/FrameComponentAssembler.java:57-66` 은 삭제 대상을 모을 때 STICKER 를 뺀다. 합성은 STICKER 도 `uploads/` 로 시작하는지만 본다(`media/compose/ComposeSpecAssembler.java:52`). **그래서 다른 사용자의 업로드 키를 넣어도 합성된다.** |
| 12 | 백엔드 테스트 1,080개 | 맞음 | 서버 모듈 기준이다. compose-core 18개와 compose-lambda 6개를 더하면 1,104개다. |

### 1/3 — PHOTO 의 실제 의미

- `frame/enums/ComponentType` 의 값은 PHOTO, STICKER, TEXT 셋이다.
- PHOTO 는 프레임 위에 얹는 사용자 업로드 이미지 레이어다. 좌표, 크기, 회전, zIndex, opacity 를 가진다.
- 촬영 사진이 들어가는 슬롯은 컴포넌트가 아니다.
  - 슬롯 위치는 `frame/enums/FrameType` 이 4칸 고정 좌표로 정한다(CLASSIC/WIDE/GRID/POLAROID).
  - 촬영 원본은 ComposeJob 의 `source_key_1~4` 로 따로 들어가 슬롯 순서대로 놓인다.
- compose-core(ComposeSpec)에는 PHOTO 라는 개념이 없다. 슬롯, 원본 4장, 범용 Layer 목록만 있다. 서버가 PHOTO·STICKER·TEXT 를 모두 Layer 로 펴서 넘긴다(`media/compose/ComposeSpecAssembler.java:20-60`).
  - 그래서 렌더러에게 PHOTO 와 STICKER 는 같다. 다른 것은 서버의 저장·정리 경로뿐이다. 스티커 문제(11번)가 생기는 이유다.
- Asset 설계는 「슬롯 = 레이아웃 고정 4칸」, 「레이어 = Asset 참조」로 나누는 것이 현재 구조와 맞다.
- **슬롯 개수는 스키마에 고정돼 있다.** ComposeJob 의 source 4컬럼이 NOT NULL 이다. FrameCreateRequest 의 `cellCutouts` 는 `@Size(4,4)` 다. 2컷·6컷 같은 행사용 변형을 원하면 스키마 변경이 필요하다.

### 2/3 — 데이터 모델

**기획서가 빠뜨린 가장 큰 제약: 소유 주체가 전부 User 이고, S3 경로도 사용자 기준이다.**

- 소유 주체 컬럼
  - `compose_job.user_id` NOT NULL(`media/entity/ComposeJob.java:45`)
  - `user_media.user_id` NOT NULL(`media/entity/UserMedia.java:21`)
  - `frame.user_id` 는 nullable 이다. 시스템 프레임은 `is_system=true` 이고 user 가 null 이다(`frame/entity/Frame.java:54·57`).
  - `user_subscription.user_id`
- S3 키는 전부 `uploads/users/{publicId}/` 아래다(`storage/util/S3Keys.java:15`).
- 소유권 검사는 「키가 내 publicId 로 시작하는가」다(`S3Keys.assertOwnedBy`). 합성 원본 검사(`ComposeService.validateSourceOwnership`), 결과 키, 썸네일 키가 모두 publicId 에서 만들어진다.
- 그래서 Workspace 를 소유 주체로 바꾸면 테이블 추가로 끝나지 않는다. 함께 바꿀 것이 셋이다.
  - S3 경로 규칙(기존 키를 그대로 둘지, 복사할지)
  - 모든 소유권 검사
  - 비회원 참가자가 publicId 없이 업로드·합성하는 경로

**유지 / 확장 / 신규**

| 구분 | 대상 | 비고 |
| --- | --- | --- |
| 유지 | terms, terms_version, current_terms_version, terms_agreement(_history) | ConsentRecord 의 바탕이 된다. 행사 참가자 동의는 User 가 없어 별도 테이블이 필요하다. |
| 유지 | notice, coupon / user_coupon | — |
| 확장 | users | Membership 과 연결만 한다. |
| 확장 | frame / frame_component | 지금은 PUT 이 그 자리에서 덮어쓴다(orphanRemoval). 「발행본 불변」에는 FrameVersion 이 새로 필요하다. ComposeJob 이 spec 을 스냅샷으로 들고 있어 과거 결과는 이미 안전하다. |
| 확장 | compose_job | 시도 횟수, 소유 주체(workspace / participant session), event_id 를 추가한다. 멱등 유니크 `(user_id, idempotency_key)` 를 주체별로 바꾼다. spec_json 타입도 바꾼다. |
| 확장 | user_media | Media/ResultAccess 로 일반화한다. `s3_key` unique 는 유지한다. |
| 확장 | user_subscription, payment, payment_order, billing_key | 개인 구독으로 유지한다. 주체 확장은 3/3 의 결제 절에서 다룬다. |
| 신규 | Workspace, Membership, Project, Event, EventGrant, EventFrame | — |
| 신규 | ParticipantSession, Asset | 지금은 자산 테이블이 없고 S3 key 문자열만 있다. |
| 신규 | ResultAccess | 토큰 해시를 보관한다. |
| 신규 | Contract/Entitlement, UsageLedger | 합성 사용량 계량이 지금은 없다. |
| 신규 | ExportJob, AuditLog | 감사 로그가 지금은 없다. |

**개인 공간 백필 — 가능하다. 단 조건이 셋이다.**

- 모든 소유 행에 user_id 가 있다. 그래서 「사용자 1명당 개인 Workspace 1개」를 만들어 user_id 로 잇는 일은 SQL 만으로 된다.
- 조건 1: 시스템 프레임(user null)은 Workspace 가 아니라 전역(시스템) 범위로 남긴다.
- 조건 2: S3 키는 옮기지 않는 쪽을 권한다. 옛 키는 `users/{publicId}/` 에 그대로 두고, 소유권 판정만 DB(Asset.owner) 기준으로 바꾼다. 옮기려면 복사, DB 갱신, 삭제를 원자적으로 해야 한다.
- 조건 3: 탈퇴 대기(DELETED_REQUESTED) 처리와 연쇄 삭제 핸들러(FrameUserDeletionHandler 등)도 Workspace 기준으로 다시 짜야 한다.
- 운영 데이터 규모는 운영에 접속하지 않아 모른다.

### 2/3 — 합성 흐름

**기획서가 틀리게 이해한 것**

- 「outbox 가 없다」는 틀렸다. `compose_job` 행 자체가 outbox 역할을 한다.
  - 트랜잭션 안에서 PENDING 행을 저장한다.
  - 커밋 직후(AFTER_COMMIT) 비동기 invoke 를 한다.
  - invoke 가 유실되면 재실행 스케줄러가 다시 줍는다(백엔드 `docs/adr-0001`).
  - 그래서 별도 outbox 테이블은 중복이다. 사용량 예약만 같은 트랜잭션에 넣으면 된다.
- 「콜백 중복 멱등」은 이미 있다.
  - complete/fail 은 PENDING 일 때만 상태를 바꾼다.
  - 결과 키는 job 마다 정해진다(`fourcuts/job-{id}.jpg`).
  - `user_media.s3_key` unique 가 마지막 방어선이다.
- 「입력 큐 → Lambda」 추가는 이득이 작고 비용이 크다.
  - Lambda 비동기 호출에는 이미 AWS 내부 이벤트 큐와 재시도 2회가 있다.
  - SQS 트리거로 바꾸면 Lambda 를 동기로 부르게 된다. 그러면 지금 받는 Destination 통지(condition, requestPayload)가 오지 않는다.
  - 그 경우 함수가 결과 SQS 로 직접 보내야 하고, ComposeResultConsumer 파싱도 다시 짜야 한다.
  - 스로틀·타임아웃을 함수 밖에서 관측한다는 ADR-0001 의 근거도 무너진다(백엔드 `docs/adr-0001-compose-result-channel.md` §6).

**실제로 바꿔야 할 것**

- attempt 컬럼과 상한, 백오프. 상한을 넘으면 FAILED 로 확정하고 사용량을 돌려준다.
- 실패하거나 방치된 원본을 정리하는 배치.
- UsageLedger 예약을 합성 요청(requestCompose)과 같은 트랜잭션에 넣는다. 완료·실패 처리(completeJob/failJob)에서 확정하거나 돌려준다.
- 소유 주체 일반화(위 데이터 모델 절).
- 결과 SQS 와 DLQ(maxReceiveCount 5)는 이미 있다(백엔드 `compose-lambda/README.md`).

**빠뜨린 운영 제약 — 행사 부하는 Lambda 동시성 한도부터 다시 계산해야 한다**

- Lambda 예약 동시성(reserved concurrency)은 30 이다. **(2026-10-26 정정: 백엔드 `docs/measurement-2026-08-23.md:59-65` 는 계정 동시 실행 한도가 10 이라 예약 동시성을 걸 수 없다고 적었다. 문서끼리 어긋나므로 실제 값을 재확인해야 한다. 「18건 429」는 예전 동기 호출에서 난 결과이고, 지금 비동기 호출은 30건 모두 성공했다. 자세한 내용은 `docs/plan-review-r3-2026-10-26.md` ⑭.)**
- 2026-08-21 측정에서 동시 18건에 429 가 났다(백엔드 `docs/adr-0001:46-53`).
- 백엔드 `docs/perf-10k-dau.md:72` 는 스파이크 때 동시성 10.4 가 필요하다고 본다.

### 2/3 — 인증

| 기획서 제안 | 현재 | 바꿀 것 |
| --- | --- | --- |
| sessionId 단위 다중 세션 | Redis 키가 사용자당 하나다. | refresh 토큰에 sessionId 클레임을 넣는다. 키를 `REFRESH_TOKEN:USER:{publicId}:{sessionId}` 로 바꾸고 `refresh-rotate.lua` 를 고친다. |
| 재사용 탐지 시 다른 기기 세션 유지 | 유일한 세션을 지운다. | 키를 나누면 저절로 된다. 다만 「전체 기기 로그아웃」과 「이 기기만」을 API 에서 구분해야 한다. 지금 `DELETE /api/harucut/logout` 은 사용자 키 하나를 지운다. |
| 권한 회수 즉시 반영 | **안 된다.** `auth/security/JwtAuthenticationFilter.java:58-64` 는 access 토큰 클레임만 믿고 DB 를 보지 않는다. 역할·상태는 30분 뒤 재발급 때만 반영된다(`application.yaml:97` access-expiration 30m). | 요청마다 Redis 에서 토큰 버전을 확인하거나, 회수 대상을 Redis 차단 목록에 넣는다. 908MB 서버에서는 DB 보다 Redis 조회가 낫다. 클레임 설계 근거는 백엔드 `docs/jwt-authorization-claims.md`. |
| 앱 소셜 로그인(PKCE + 일회용 코드) | 웹 전용이다. `auth/oauth2/CustomOAuth2SuccessHandler.java` 가 쿠키를 심고 FRONTEND_URL 의 콜백으로 보낸다. CORS·SameSite 도 웹 기준이다. | 일회용 코드 발급 엔드포인트, 앱 스킴 리다이렉트, 쿠키 대신 응답 본문으로 토큰을 주는 경로가 새로 필요하다. |

### 2/3 — 업로드

**현재 구조**

- presign 이 Content-Type 과 Content-Length 를 서명에 넣는다. 그래서 크기와 MIME 헤더는 S3 가 강제한다.
- 크기 상한은 10MB 다(`storage/dto/PresignedUploadRequest.java:54`).
- presign 유효 시간은 24시간이다(`storage/service/S3FileStorageService.java:28`). 행사용으로는 너무 길다.
- 확장자와 MIME 이 짝이 맞는지 검사한다.

**기획서 제안 검수**

- intent/complete 분리, complete 에서 실제 형식·디코딩 검사
  - 지금은 complete 단계가 없고, 실제 바이트 검사도 없다. 제안대로 새로 만들어야 한다.
  - 디코딩 검사를 EC2(힙 약 360MB)에서 하면 위험하다. 6000px 이미지 한 장을 디코딩하는 데 수십 MB 가 든다. Lambda 에서 하거나 헤더 바이트만 읽는 방식을 권한다.
- assetId 만 받기
  - 지금은 클라이언트가 S3 key 문자열을 보낸다. 서버는 정규화한 뒤 prefix 로 검사한다.
  - 스티커 구멍(1/3 의 11번)이 이 방식에서 생겼다. 제안 방향이 맞다.
- 고아 파일 정리
  - 지금은 없다. 두 종류를 모두 새로 만들어야 한다.
  - presign 만 받고 쓰지 않은 원본과 실패한 합성 원본.
  - STICKER 파일(프레임을 삭제하거나 수정해도 지워지지 않는다).

### 3/3 — API 경로

**현재 규칙: 접두사는 기능이 아니라 인증 수준을 뜻한다.**

| 접두사 | 뜻 |
| --- | --- |
| `/api/harucut/*` | 로그인 전 인증 동작(register, login, reissue, logout, 비밀번호 재설정). 예외로 `/exit`·`/reactivate` 는 로그인이 필요하다. |
| `/api/auth/**` | 「로그인 필요」 경로다. 인증 기능이라는 뜻이 아니다(예: `/api/auth/user/frame`, `/api/auth/payments`). |
| `/api/admin/**` | 관리자 |
| 개별 공개 경로 | `/api/terms`, `/api/notices/**`, `/api/payments/webhook`, `/api/email-auth/**` |

- 기본값은 거부다. `config/SecurityPaths.PUBLIC` 목록에 없는 경로는 모두 USER/ADMIN 역할이 필요하다(`config/SecurityConfig.java:84`).

**기획서 경로와 비교**

- 로그인 경로(`/api/workspaces`, `/api/events/{id}`, `/api/assets/upload-intents`, `/api/frames/{id}/versions`, `/api/events/{id}/compose-jobs` 등)
  - 동작에는 문제가 없다. 기본값이 「로그인 필요」이기 때문이다.
  - 다만 기존 `/api/auth/user/...` 규칙과 어긋난다. 프레임 API 가 `/api/auth/user/frame` 과 `/api/frames` 두 갈래가 된다.
  - **한쪽으로 정해야 한다.** 새 규칙이 깔끔하지만, 그러면 기존 경로 폐기 계획과 프론트 이전이 필요하다.
- 공개 경로(`/api/public/events/{slug}`, `/sessions`, `/api/results/{token}/download`)
  - `SecurityPaths.PUBLIC` 에 명시적으로 넣어야 열린다. 빠뜨리면 401/403 이다.
  - `/api/public/**` 처럼 접두사 하나로 모으는 것은 현재 규칙보다 낫다. `/api/results/{token}` 도 `/api/public/results/{token}` 으로 맞출 것을 권한다.
  - 참가자 세션 토큰은 지금의 JWT 쿠키와 다른 인증 주체다. 필터 체인에 새 인증 방식을 넣어야 한다.
- 관리자 경로(`/api/admin/contracts`, `/api/admin/manual-grants`)는 규칙과 맞다. 다만 1/3 의 5번 위험(`@PreAuthorize` 누락)이 있다.
- 프론트 CI 영향: 백엔드 `OpenApiConfig` 가 `/api/admin/**` 와 webhook 을 사용자 문서에서 뺀다. 새 공개 경로가 어느 문서 그룹에 잡히는지 확인해야 한다. 프론트 계약 검사(`scripts/check_backend_contract.py`, CI 는 운영 `/v3/api-docs` 를 읽는다)가 이 문서를 기준으로 돈다.

### 3/3 — 마이그레이션과 인프라

**Flyway baseline 순서**

1. 운영에서 `mysqldump --no-data` 로 실제 스키마를 받아 V1 로 만든다. `baseline-on-migrate` 를 쓴다.
2. 동시에 ddl-auto 를 `validate` 로 바꾼다. update 를 같이 켜 두면 Flyway 와 Hibernate 가 둘 다 스키마를 고친다.
3. 인덱스는 update 가 기존 테이블에 만들지 않았을 수 있으니 덤프가 기준이다(1/3 의 1번).
4. MySQL 8.0 은 EOL 이다. 8.4 업그레이드와 baseline 중 무엇을 먼저 할지도 함께 정한다.

**908MB EC2 한 대로 행사를 감당할 수 있는가**

- 렌더링은 Lambda 로 빠져 있어서 서버 연산 부담은 작다. 대신 다음이 걸린다.
- **무중단 배포가 아니다.** 배포마다 앱이 다시 뜨고, 뜨는 데 최대 3분이 걸린다(deploy.yml 헬스체크). 행사 중 배포는 곧 장애다. ADR-0001 §6 도 「무중단 배포를 도입하면 재검토」를 조건으로 걸어 두었다.
- 메모리: app 600m(힙 약 360MB), mysql 350m(buffer pool 128M), redis 64mb. 나머지는 스왑에 기댄다(`deploy/prod/compose.yml` 머리말).
- Redis 는 maxmemory 64mb, 정책 noeviction 이다. 참가자 세션을 Redis 에 넣으면 금방 찬다.
- 단일 장애점이다. 인스턴스가 하나이고 DB 와 앱이 같은 호스트에 있다.
- Lambda 예약 동시성 30(2/3 합성 흐름 절. 2026-10-26 정정: 실제 한도 재확인 필요).
- 백엔드 의견(실측 아님):
  - P2 검증(행사 한 건)은 버틸 가능성이 있다. 조건은 셋이다: 행사 시간에 배포 동결, 인스턴스 1~2GB 로 상향, Lambda 동시성 재계산.
  - 기업·다중 행사부터는 RDS 분리와 무중단 배포가 필요하다.

**스테이징 — 필요하다**

- 지금은 로컬과 운영뿐이다. `dev.harucut.com` 은 DNS 레코드가 없었다.
- Flyway 첫 적용, MySQL 8.4, 결제 웹훅(PortOne 테스트 모드)은 운영과 같은 스키마에서 리허설해야 한다.
- 최소 구성: 같은 compose 를 작은 인스턴스에 하나 더 띄운다. 운영 스키마 덤프와 가짜 데이터를 넣는다.

### 3/3 — 결제

**재사용할 것**

- `PaymentGateway` 인터페이스(issueBillingKey, charge). PortOne V2 빌링키 결제와 모양이 같다.
- PaymentOrder(idempotency_key 있음), Payment(pg_transaction_id, failure_code), BillingKey.
- UserSubscription: `@Version` 낙관적 락, effectiveTier, 예약 쿠폰. 웹 정기결제 구독에 그대로 쓴다.
- 갱신·만료 Spring Batch(JDBC 저장소, 02:00 / 02:30).
- MockGatewayGuard, PlanPricingProperties(가격을 설정으로 관리), 쿠폰.

**버리거나 다시 쓸 것**

- `WebhookService`: 로그만 남기는 껍데기라 사실상 새로 짠다.
- `PaymentWebhookVerifier.verify(rawBody, signature)`: 헤더를 하나(`X-Signature`)만 받는다(`payment/controller/PaymentWebhookController.java:39`).
  - PortOne V2 웹훅은 Standard Webhooks 방식이다. `webhook-id`, `webhook-timestamp`, `webhook-signature` 세 헤더로 서명을 검증한다.
  - 그래서 인터페이스 시그니처를 바꿔야 한다.
  - 기획서의 「조회 대조」(웹훅을 받으면 PortOne API 로 다시 조회해 대조)는 맞는 방향이다. 지금은 조회 API 호출 자체가 없다.
- `PgProvider` enum: 지금 값은 MOCK, TOSS 다. PORTONE, APPLE, GOOGLE 이 필요하다. 기존 TOSS 행이 있는지는 운영을 봐야 안다.

**기획서가 빠뜨린 것**

- 스토어 구독은 UserSubscription 의 전제와 맞지 않는다. UserSubscription 은 서버가 기간을 계산하고, autoRenew 를 들고, 직접 청구한다.
  - 구독 출처 컬럼(source: WEB_BILLING / APP_STORE / PLAY)과 외부 거래 ID 가 필요하다.
  - 갱신 배치(RenewalPreparationService)가 스토어 구독을 건너뛰게 해야 한다.
  - 기획서의 「스토어 구독에는 02시 배치를 적용하지 않는다」는 방향은 맞다. 하지만 지금 배치는 출처를 구분할 수단이 없어서 스키마 변경이 먼저다.
- 구독 주체가 user_id 하나다. Workspace·기업 계약은 UserSubscription 확장이 아니라 Contract/Entitlement 신규로 가는 것이 맞다.
  - effectiveTier 를 계산하는 곳이 모두 사용자 기준이라 판정 로직도 함께 바꿔야 한다(`UserService.java:59`, `SubscriptionPolicyService.java:62`, `SubscriptionUsageService.java:34`).
- 새 엔드포인트가 필요하다: Google PENDING 처리, Apple 영수증 서버 검증, 스토어 서버 알림(RTDN, App Store Server Notifications V2). 모두 `SecurityPaths.PUBLIC` 에 넣어야 한다.

## 사용자 결정 (2026-10-25)

**비회원이 서버에 사진을 올릴 수 있는지는 「어디로 들어왔는가」로 나눈다.**

| 진입 경로 | 서버 업로드 | 비고 |
| --- | --- | --- |
| 일반 비회원 체험(홈 → 게스트 체험) | **안 한다** | 지금처럼 기기 안에서만 만든다. 체험 뒤 로그인하면 체험 결과는 계정으로 이어서 올린다(현재 `pendingGuestSave` 흐름 유지). |
| 업체·운영자가 준 행사 링크(`/e/slug`, QR) | **한다** | 비회원이어도 서버에 올리고 저장한다. 여러 장을 찍는 행사도 포함한다. 본인 재다운로드(`/r/token`)와 주최자 사진함의 바탕이다. |

이 결정이 바꾸는 것:

- **약관·개인정보 처리방침.** 지금 제8조는 비회원 범위를 「사진 촬영, 이미지 다운로드」로 정한다. 행사 링크 참가자는 예외로 따로 적어야 한다. 화면 문구와 `packages/shared` 의 비회원 항목 상수, 그 테스트도 함께 바꿔야 한다.
- **프론트 경로 판정.** 「비회원 + 행사 세션 있음」이라는 새 상태가 생긴다. 일반 비회원은 지금처럼 업로드가 막혀야 하므로, 행사 세션 여부로 갈라야 한다(`apps/web/lib/protectedPaths.ts`, `apps/web/proxy.ts`).
- **백엔드 인증 주체.** 행사 참가자는 User 가 아니라 ParticipantSession 으로 업로드·합성한다. 일반 비회원에게는 이 경로를 열지 않는다.

열린 질문:

- 행사 참가자에게 「갤러리에서 불러오기」도 허용하는가, 촬영만 허용하는가? 기획서는 행사 설정(「카메라와 업로드 허용 여부」)으로 행사마다 고르게 했다. 이 방식이 맞는지 확인이 필요하다.

## 기획서에 반영을 요청할 것 (프론트·백엔드 합본)

우선순위 순이다.

1. **비회원 참가자 경로가 통째로 신규다.** 범위는 아래 「사용자 결정」을 따른다.
    - 프론트: 약관 제8조가 비회원 업로드를 막고 있고, 완성본을 서버에 등록하는 API 가 없다.
    - 백엔드: 합성·업로드·보관이 모두 User 소유이고, S3 경로도 사용자 기준이다.
    - P2 의 범위와 일정은 이 둘을 기준으로 다시 잡아야 한다.
2. **행사 부하의 한계는 서버가 아니라 운영 구조다.** Lambda 동시성 한도(30 또는 계정 한도 10 — 재확인 필요, 2026-10-26 정정), 무중단 배포 없음, Redis 64MB noeviction. P2 시연 전에 동시성 재계산, 배포 동결, 인스턴스 상향, 스테이징이 필요하다.
3. **기획서가 과하게 잡은 것을 뺀다.** 합성 outbox·콜백 멱등은 이미 있고, 입력 큐 추가는 ADR-0001 을 깨뜨린다. 실제로 필요한 것은 attempt 상한, 원본 정리 배치, 사용량 예약이다.
4. **이미 있는 것을 신규로 잡지 않는다.** 배경 이미지 업로드는 이미 된다. P1 은 cover/contain/위치 조절만 추가하면 된다.
5. **사진 칸 편집과 칸 수 변경은 별도 단계로 뺀다.** 칸은 프론트 상수, 합성 엔진, DB 스키마(source 4컬럼 NOT NULL, `cellCutouts` 4개 고정) 세 곳에 고정돼 있다.
6. **CMS 확장 전에 관리자 API 를 URL 단위로 보호한다.** 지금은 컨트롤러마다 붙인 애노테이션에만 기댄다.
7. **API 경로 규칙을 먼저 정한다.** 기존 `/api/auth/user/...` 를 유지할지 새 규칙으로 옮길지 정해야 한다. 프론트 프록시 핸들러, `proxy.ts` 경로 판정, 계약 검사 CI 가 모두 이 결정에 묶인다.
8. **동의는 서버가 강제한다.** 지금은 이메일·소셜 가입 모두 서버가 약관을 검사하지 않는다.
9. **스토어 결제는 구독 출처 컬럼부터 만든다.** 인앱 결제는 앱 셸 원칙(ADR-0003)도 넓히는 일이라 별도 결정 기록이 필요하다.

## 참고

- 현재 상태 전체: Claude Docs 「하루컷 현재 상태 — 백엔드·프론트 전체」(기획서의 S1).
- 프론트 규칙 원본: `AGENTS.md`. 문서 지도: `docs/README.md`.
