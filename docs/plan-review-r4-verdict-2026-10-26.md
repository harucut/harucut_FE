# 고도화 기획서 R4 — D01~D13 판정

2026-10-26 · 대상: 「하루컷 제품 고도화 기획서」 R4

- 판정은 세 가지다: **적합 / 수정 필요 / 실환경 확인 필요.**
- 차이가 있는 항목만 근거 코드와 필요한 수정을 적었다. 사용자 결정은 그대로 두었다.
- 기준 커밋
  - 프론트: `harucut_FE` develop `c431f61`(앱 코드는 `abc1fe7` 과 같음)
  - 백엔드: `popeye0618/Harucut` main `8bab406`
- 프론트는 이 저장소에서 직접 확인했다. 백엔드는 하루컷 백엔드 세션이 확인했다.
  - 백엔드 근거에는 `BE:` 를 붙였다. 경로는 `src/main/java/com/harucut/` 기준이다.
- 백엔드가 실행한 것은 모두 읽기 전용이다. 코드·AWS·운영 DB 는 바꾸지 않았다.
  - 로컬 MySQL 컨테이너에서 `SHOW CREATE TABLE`·`SHOW INDEX`
  - AWS SDK 클래스 `javap`
  - SDK 2.25.67 로 가짜 자격증명 presign 1회. 네트워크 호출은 없었다.

## 요약

| ID | 판정 | 한 줄 |
| --- | --- | --- |
| D01 | 수정 필요 | 기업 화면에 링크·QR 생성부가 없다. 옛 주소 안내 화면도 필요 없다 |
| D02 | 적합 | — |
| D03 | 수정 필요 | 파비콘이 파일 규칙으로 붙는다. 테마 스크립트와 촬영 화면 고정 색도 옮길 대상이다 |
| D04 | 수정 필요 | 프론트 저장소가 store 전체를 비운다. 백엔드는 적합(관련 코드 없음) |
| D05 | 적합 | 인용한 현재 동작이 코드와 일치한다 |
| D06 | 적합 | 인용한 현재 구조가 코드와 일치한다 |
| D07 | 수정 필요 | CSRF 는 「유지」가 아니라 「신규」다. OpenAPI 커스터마이저가 빈 security 를 덮어쓴다. 프론트는 클라이언트를 따로 둔다 |
| D08 | 수정 필요 + 실환경 확인 필요 | SDK 상향 없이 조건부 PUT 을 서명할 수 있다. 412 동작과 CORS 는 실제 버킷에서 확인한다 |
| D09 | 수정 필요 | 실행별 출력 key 대신 결정적 key 를 유지한다. 조건 3개를 붙인다 |
| D10 | 실환경 확인 필요 | 저장소의 값은 설정 명령 예시뿐이다 |
| D11 | 수정 필요 + 실환경 확인 필요 | 참가자 job 을 쓰기 전에 고칠 곳을 6단계에 명시한다. 운영 스키마를 확인한다 |
| D12 | 수정 필요 | 백엔드 문구 2곳. 프론트는 토큰이 Vercel 로그와 미리보기 크롤러에 남는다 |
| D13 | 적합 | — |

## 수정 필요

### D01 — 대상이 없는 작업 2개를 지운다 (프론트)

- **근거**
  - 기업 화면의 링크는 `#inquiry`, `/features` 둘뿐이다(`apps/web/components/enterprise/EnterpriseView.tsx:70,76`). 행사 링크나 QR 을 만드는 코드는 없다.
  - 문의 폼의 `eventName` 은 문의 메일 본문에 들어가는 값이다(`apps/web/components/enterprise/EnterpriseInquiryForm.tsx:16,55`). 행사 쿼리와는 관계없다.
- **수정**
  - 4절 「기업 화면의 링크 생성부를 함께 전환」과 F47 「옛 QR 생성 제거」를 지운다. 대신 「Studio 참가 링크·QR 생성은 신규」로 적는다.
  - 「옛 행사 파라미터 주소는 새 링크 확인을 안내」를 지운다. 배포한 QR 이 없으니 그 화면을 볼 사람이 없다. `event` 쿼리는 무시하고 일반 `/shoot` 으로 동작하면 된다.
  - 문의 폼의 `eventName` 은 유지한다고 적는다.
  - 걷어낼 곳은 다음과 같다.
    - `apps/web/app/shoot/{page,select/page,capture/page,result/page,upload/page}.tsx`
    - `components/event/EventBanner.tsx`, `lib/eventName.ts`
    - `lib/shootSession{Store,Persistence,Storage}.ts` 의 `eventName` 필드

### D03 — 메타데이터만으로는 하루컷 표시가 남는다 (프론트)

- **근거**
  - 파비콘이 두 군데 있다.
    - `apps/web/app/favicon.ico` 는 루트 파일 규칙이라 모든 경로에 붙는다.
    - `public/favicon.ico` 는 아이콘 링크가 없을 때 브라우저가 직접 요청한다.
  - `ColorThemeScript` 가 루트 `<body>` 첫 줄에서 `data-theme` 을 심는다(`apps/web/app/layout.tsx:69`, `lib/colorTheme.ts:157`).
  - 촬영 화면에 하루컷 색이 고정값으로 들어 있다(`apps/web/app/shoot/capture/page.tsx`).
    - 무대 바탕 `bg-[#0B0B0C]`(:109)
    - 하루컷 녹색 `rgba(30,215,96,…)`(:147)
    - 흰색·검정(:148, 164, 268-269)
  - `useDarkStage` 는 상태바와 `theme-color` 를 개인 테마 동기화(`setDarkStageOverride` → `ColorThemeSync`)로 바꾼다(`hooks/useDarkStage.ts`).
- **수정**
  - 행사 경로에는 중립 아이콘 링크를 직접 지정한다고 적는다. `metadata.icons` 만으로는 부족하다.
    - 파일 규칙과 metadata 중 무엇이 이기는지는 실환경 확인이 필요하다. 구현 때 설치된 Next 16.4.3 문서로 확인한다.
  - 루트에서 일반 서비스로 옮길 목록에 `ColorThemeScript`·`ColorThemeSync`·`useDarkStage` 를 추가한다. 위 고정 색도 토큰으로 바꿀 대상에 넣는다.
  - `ExternalBrowserGate` 는 행사에도 필요하므로 루트에 남긴다.

### D04 — 키를 나누는 것만으로는 다른 칸이 지워진다 (프론트)

- **근거**
  - 촬영 임시 저장소는 IndexedDB `harucut-shoot-session` 의 store 하나다.
  - 만료되거나 깨진 값을 읽으면 `store.clear()` 로 store 전체를 비운다(`apps/web/lib/shootSessionStorage.ts:61-73`). 지울 때도 `clear()` 다(`:143`).
  - 삭제 표시 `harucut:shoot-cleared-at` 도 origin 전체에 하나다(`lib/shootSessionPersistence.ts:11`).
- **수정**
  - 「`clear()` 를 이름공간 단위 삭제로 바꾸고, 삭제 표시도 이름공간별로 둔다」를 넣는다.
  - 행사 흐름은 별도 DB 이름을 쓰기를 권한다.
  - 이 수정이 없으면 한 회차가 만료될 때 개인 초안과 다른 탭의 행사 초안까지 지워진다. F25 와 정반대다.
- 백엔드는 적합하다. 부스·회차·기기 관련 코드가 아직 없어서 충돌하는 기존 구현이 없다.

### D07 — CSRF 와 OpenAPI 는 새로 만들고, 프론트는 클라이언트를 나눈다

- **근거 (백엔드)**
  - 기획서가 인용한 사실은 맞다.
    - JWT 필터는 `accessToken` 쿠키를 먼저 보고, 없으면 Bearer 헤더를 본다(`BE: auth/security/JwtAuthenticationFilter.java:86-88`).
    - 토큰이 무효해도 PUBLIC 경로면 통과시킨다(같은 파일 73-80행 부근).
    - 체인의 마지막 규칙은 `hasAnyRole(USER, ADMIN)` 이다(`BE: config/SecurityConfig.java:84`).
  - `SecurityPaths` 는 세 곳에서 함께 쓴다.
    - permitAll(`SecurityConfig.java:82`)
    - JWT 실패 무시(`:69`)
    - OpenAPI 자물쇠(`config/openapi/ApiErrorDocumentationCustomizer.java:72`)
  - CSRF 는 꺼져 있다(`BE: SecurityConfig.java:47`). 쿠키 보호는 SameSite 기본값 Lax(`application.yaml:103`)와 CORS 뿐이고, Origin 검사도 없다.
  - 「필터 중복 등록」은 지금은 해당이 없다. JWT 필터는 `@Component` 가 아니라 `new` 로 만들어 `addFilterBefore` 한다(`SecurityConfig.java:68-69`). 새 참가자 필터를 빈으로 만들 때만 `FilterRegistrationBean enabled=false` 가 필요하다.
  - OpenAPI 커스터마이저는 operation 의 security 가 null 이거나 **빈 목록이면** cookieAuth·bearerAuth 를 붙인다(`BE: ApiErrorDocumentationCustomizer.java:108-114`, 109행 조건 `!= null && !isEmpty()`).
    - 이 처리는 `SecurityPaths.PUBLIC` 에 없는 경로에서만 일어난다(`:72,74`).
    - R4 대로 참가자·부스·결과 경로를 PUBLIC 에 넣지 않으면, 이 경로들은 모두 회원 인증 경로로 문서화된다. cookieAuth 와 회원용 401·403(탈퇴·정지)이 붙는다.
    - `OpenApiConfig` 에 전역 security 는 없다. operation 단위로만 붙는다.
- **근거 (프론트)**
  - 프론트 API 클라이언트는 모든 401 에 회원 토큰 재발급을 시도한다. 실패하면 전역 세션 만료 처리를 부른다(`apps/web/lib/clientApi.ts:289-320`).
  - 예외는 두 경로뿐이다(`:65-68`).
- **수정**
  - 15절 「전용 SecurityFilterChain과 회원 쿠키 분리」 마지막 단락을 고친다.
    - 원문: 「자동 전송되는 인증 쿠키를 사용한다면 CSRF·Origin·SameSite 정책을 유지한다.」
    - 고칠 문장: 「현재 CSRF 는 비활성이고 SameSite=Lax 에만 의존한다. 참가자 쿠키를 쓰면 CSRF 토큰 또는 Origin 검사를 새로 적용하거나, 쿠키 대신 헤더 토큰을 쓴다.」
  - 15절 「OpenAPI 인증 범주와 계약 검사」에 한 줄을 넣는다.
    - 넣을 내용: 「현재 커스터마이저는 빈 security 를 회원 인증으로 덮어쓴다.」
    - 커스터마이저가 경로의 인증 범주(회원·참가자·부스·결과 토큰·웹훅·공개)를 받아 범주별 스킴과 오류를 붙이게 바꾼다.
    - 빈 security 를 「의도한 무인증 표시」로 존중하는 분기도 넣는다.
  - 프론트: 참가자·부스·결과 요청은 회원 재발급 로직이 없는 별도 클라이언트를 쓰고, 401 은 참가 흐름이 직접 처리한다고 적는다. 예외 경로를 하나씩 추가하는 방식은 빠뜨리기 쉽다.

### D08 — SDK 상향 없이 조건부 PUT 을 서명한다

- **근거 (백엔드)**
  - `24h` 상수 하나를 PUT presign(`:63`)과 GET presign(`:113`)이 같이 쓴다(`BE: storage/service/S3FileStorageService.java:28`).
  - presign 응답(`storage/dto/PresignedUploadResponse`)은 key·uploadUrl·contentType·expiresIn 뿐이다. 서명된 헤더 목록은 없다.
  - 같은 원본 key 를 여러 job 이 쓰는 것을 막는 장치가 없다. 그래서 「한 job 연결」 지적이 맞다.
    - `source_key` 에 유니크가 없다.
    - `validateSourceOwnership` 은 접두사만 본다(`ComposeService.java:68`).
    - 한 job 이 성공하면 원본을 지운다(`:115`).
  - 설치된 SDK 는 `software.amazon.awssdk:s3` 2.25.67 이다. 이 버전의 `PutObjectRequest` 에는 `ifNoneMatch()` 가 없다(2.57.3 에는 있다).
  - 대신 헤더를 직접 넣어 서명할 수 있다. 로컬에서 재현했다.
    - 방법: `overrideConfiguration(o -> o.putHeader("If-None-Match","*"))`
    - 결과 `signedHeaders`: `content-length, content-type, host, if-none-match=[*]`
    - URL 의 `X-Amz-SignedHeaders`: `content-length;content-type;host;if-none-match`
    - 브라우저가 이 헤더를 빼거나 바꾸면 서명이 맞지 않아 403 이 난다. 그래서 조건을 우회할 수 없다.
    - `isBrowserExecutable=false` 는 「헤더를 같이 보내야 하는 URL」이라는 뜻이다. 지금도 content-type 서명 때문에 같은 상태다.
  - SDK 상향은 공짜가 아니다. 2.30 이후 SDK 는 기본 checksum 계산이 바뀌었다. 그래서 presign 에 checksum 값이 붙어 브라우저 업로드가 깨질 수 있다고 알려져 있다(직접 검증하지 않음).
- **근거 (프론트):** S3 PUT 은 헤더를 직접 정해 보낸다(`apps/web/lib/presignedUploadApi.ts:347-350`).
- **수정**
  - 16절 「업로드 검증과 수명」의 SDK 문장을 고친다.
    - 원문: 「S38의 SDK 2.25.67은 … 조건부 PUT API를 지원하는 검증된 버전으로 상향한다.」
    - 고칠 문장: 「현재 SDK(2.25.67)에서도 presign 요청에 `If-None-Match: *` 헤더를 넣으면 서명 헤더에 포함된다(로컬 서명으로 확인). S3 의 412 동작을 테스트 버킷에서 검증한 뒤 이 방식으로 적용한다. SDK 상향은 별도 사유가 있을 때 checksum·서명 헤더 영향과 함께 검수한다.」
  - 「24시간 상수를 분리」를 「만료를 호출별 인자로 받는다」로 구체화한다. 상수를 5분으로 바꾸면 보관함 썸네일 URL 도 5분이 된다.
  - 프론트: 행사용 PUT 은 서버가 준 서명 헤더를 받아 그대로 보내도록 따로 만든다. 개인 업로드 경로는 그대로 둔다.
- **실환경 확인 필요**
  - 객체가 이미 있을 때 실제 S3 가 이 presigned PUT 에 412 를 돌려주는지, 테스트 버킷에서 확인한다.
  - 버킷 CORS 의 `AllowedHeaders` 에 `If-None-Match` 를 추가한다. 버전 관리 설정도 조회한다. 둘 다 저장소에 없다.

### D09 — 결정적 key 를 유지하고 조건 3개를 붙인다

- **근거 (백엔드)**
  - 현재 상태
    - complete/fail 은 void 이고 PENDING 이 아니면 조용히 무시한다(`BE: media/entity/ComposeJob.java:119,128`).
    - completeJob 은 읽고, 상태를 검사하고, 저장한다(`ComposeService.java:103-116`). 조건부 UPDATE 도 `@Version` 도 없다.
    - 조건부 UPDATE 는 claim 하나뿐이다(`ComposeJobRepository.java:34-42`).
  - 늦은 실패 경합은 현재 코드로도 일어날 수 있다. 그래서 「PENDING 검사만으로 부족」은 맞다.
    - 평소에는 드물다. 재실행은 claim 10분 뒤이고, 이벤트 수명은 README 상 300초다.
    - 서버가 멈췄었거나 DLQ 를 재처리할 때는 일어난다.
  - 렌더는 결정적이다.
    - compose-core·compose-lambda 의 main 코드에서 Random·UUID·now()·currentTimeMillis·parallel 을 검색하면 0건이다.
    - 입력은 job 의 spec 스냅샷과 원본 key 4개뿐이다.
  - S3 PUT 은 객체 단위로 원자적이라 반쯤 쓴 객체가 생기지 않는다. 같은 바이트를 덮어쓰는 것은 무해하다.
  - 실행별 key 는 탈퇴 정리와 어긋난다.
    - 정리는 접두사가 아니라 `s3_key`·`thumbnail_key`·`result_key` 를 명시적으로 모아서 지운다(`BE: media/handler/UserMediaDeletionHandler.java:29-31`).
    - 채택되지 않은 실행의 출력은 따로 추적하지 않으면 고아 파일이 된다.
  - 결정적 key 의 전제는 입력 불변이다. 지금은 원본 PUT 이 24시간 유효하고 같은 key 의 재PUT 을 막지 않는다(`S3FileStorageService.java:28`).
    - 그래서 두 실행 사이에 원본이 바뀌면, 결과는 1차 것이고 썸네일은 2차 것인 식으로 섞일 수 있다.
- **수정** — 13절 「서로 덮어쓰지 않는 출력과 성공 채택」의 실행별 출력 위치·winningOutputRef 기본안을 다음으로 바꾼다.
  - 「P2 는 job 단위 결정적 결과·썸네일 key 를 유지한다. 조건은 셋이다.
    - 입력 불변(조건부 PUT + 짧은 TTL, D08)
    - DB 조건부 UPDATE 로 첫 성공만 채택
    - 삭제·탈퇴 뒤 지연 재삭제(늦게 도착한 실행이 다시 쓴 객체 정리)」
  - 「실행별 출력 위치는 렌더가 비결정적이 되거나 출력별 감사가 필요해질 때 다시 검토한다.」
  - 지연 재삭제는 어느 안이든 필요하다고 적는다. job 이 DONE 이 된 뒤 늦게 온 실행이 PUT 하면, DB 행 없이 객체만 다시 생긴다.

### D11 — 참가자 job 을 쓰기 전에 고칠 곳을 명시한다

- **근거 (백엔드)**
  - 로컬 DB(Hibernate update 로 생성)의 `compose_job` 에서 user_id 로 시작하는 인덱스는 유니크 `uk_compose_job_user_idempotency(user_id, idempotency_key)` 하나뿐이다.
    - 그래서 이 유니크가 FK 를 지원하는 인덱스다.
    - 「대체 인덱스를 먼저 만들고 옛 유니크를 제거」하는 순서가 필요하다는 판단이 맞다.
  - 테스트는 H2 create-drop 이다(`application-test.yaml:8`). 17절의 「H2 로 MySQL 제약을 입증하지 않는다」가 현재와 맞다.
  - user 가 null 이 아니라고 가정하는 곳
    - `ComposeJobRepository.java:44-51` `findStalled` 의 `JOIN FETCH j.user`(inner join). **가장 위험하다.**
      - 참가자 job 이 오류 없이 결과에서 빠진다. 그래서 재실행되지 않고 PENDING 에 남는다.
      - 적체 게이지(countByStatus)에는 잡히지만 로그나 오류는 없다.
    - `ComposeService.java:143` `job.getUser().getPublicId()` — NPE
    - `ComposeService.java:110` `UserMedia.of(job.getUser()…)` — `user_media.user_id` 도 NOT NULL 이다(`UserMedia.java:21`).
    - `ComposeService.java:96` `findByIdAndUser` — 참가자 조회 경로가 없다.
    - `ComposeJob.java:107` `create()` — user 가 null 이면 예외를 던진다.
    - `ComposeJob.java:45` `@JoinColumn(nullable = false)` — 컬럼도 NOT NULL 이다(로컬 DB 확인).
    - `ComposeJobRepository.java:21` `findByUserAndIdempotencyKey` — 멱등 조회가 user 기준이다.
    - `ComposeService.java:164-170` `resultKeyFor`·`thumbnailKeyFor(publicId)` — 결과 key 가 publicId 기반이다.
    - `ComposeService.java:68` `validateSourceOwnership(publicId, …)` — 원본 소유 판정이 publicId 접두사 기준이다.
    - `UserMediaDeletionHandler.java:31,33` — 탈퇴 정리 쿼리가 user 기준이다.
      - 회원 탈퇴 때는 그게 맞다.
      - 행사 삭제·보관 만료용 정리 경로는 따로 필요하다.
  - 참고: `ComposeJob.java:27` 주석의 「운영은 none」은 실제 설정(`application-prod.yaml:10` 의 update)과 다르다.
- **수정** — 17절 「멱등 scope·User FK의 호환 이관」 6단계에 덧붙인다.
  - 「user_id nullable 전환 전에 다음을 주체(scope) 기준으로 바꾼다.
    - `findStalled` 의 inner join
    - `ComposeJob.create` 의 user 필수 검사
    - `completeJob` 의 UserMedia 생성
    - 결과·썸네일 key 의 publicId 의존
    - 멱등 조회
    - 탈퇴 정리 쿼리」
  - 「특히 `findStalled` 의 inner join 은 오류 없이 참가자 job 을 재실행에서 빠뜨리므로 테스트로 고정한다.」
- **실환경 확인 필요:** 운영 DB 의 `SHOW CREATE TABLE compose_job`. 운영 스키마는 로컬과 다를 수 있다.

### D12 — 백엔드 문구 2곳, 프론트는 토큰 링크 모양

- **백엔드 문구 1** — 16절 「행사 동의의 별도 기록」
  - 원문: 「비회원 행사 동의를 회원 User FK가 필수인 행에 넣지 않고」
  - 실제
    - `terms_agreement.user_id` 와 `terms_agreement_history.user_id` 는 NOT NULL 이다. 하지만 users 로 가는 FK 는 없다.
    - 엔티티도 `Long userId` 다(`BE: terms/entity/TermsAgreement.java:26-27`).
    - 로컬 DB 에는 `terms_id` 쪽 FK 와 `(user_id, terms_id)` 유니크가 있다.
  - 고칠 문구: 「`user_id` 가 NOT NULL 이고 `(user_id, terms_id)` 유니크인 행에」. 별도 `participant_consent` 가 필요하다는 결론은 그대로다.
- **백엔드 문구 2** — 16절 「결과 토큰·페어링의 초기 운영 설정」 마지막 단락
  - 원문: 「제한 카운터는 기존 EmailRateLimit 패턴을 참고할 수 있으나」
  - 실제: `EmailRateLimit` 은 카운터가 아니다. `setIfAbsent` 로 60초 쿨다운 키 하나를 거는 방식이다(`BE: auth/email/EmailRateLimit.java:14-15`).
  - 「IP당 분당 30회」, 「5회 실패 후 종료」에는 INCR+EXPIRE 같은 계수 방식이 따로 필요하다.
  - 고칠 문구: 「쿨다운 키(EmailRateLimit) 방식은 계수 제한에 그대로 쓸 수 없으므로 별도 카운터를 둔다.」
- **프론트 근거**
  - 웹은 Vercel 에서 돈다. Vercel 요청 로그는 경로를 그대로 남기고, 우리가 지울 수 없다.
  - 카카오톡 같은 링크 미리보기는 카카오 서버가 그 URL 을 직접 가져간다.
  - `robots.ts` 는 보호 경로·`/api/`·`/oauth2/` 만 막는다(`apps/web/app/robots.ts:9`).
- **프론트 수정**
  - 결과 링크를 `/r#{token}` 으로 바꾼다. 아니면 「Vercel 요청 로그와 미리보기 크롤러에 토큰이 남는다」를 감수할 위험으로 적는다.
    - `#` 뒤는 서버로 가지 않는다. 그래서 로그·크롤러·Referer 어디에도 남지 않는다.
    - 백엔드 API 는 바뀌지 않는다. 바뀌는 것은 사용자에게 주는 링크 모양뿐이다.
  - `Referrer-Policy: no-referrer`·`Cache-Control: no-store` 는 프론트 `/r` 페이지 응답에도 붙인다고 적는다. 토큰이 들어 있는 것은 그 HTML 이다.
  - `/r`·`/e` 를 robots 에서 막고 `noindex` 를 건다.
  - 외부 분석 도구는 지금 설치돼 있지 않다. 「분석으로 토큰 전달 금지」는 나중에 도구를 넣을 때의 조건으로 둔다.
- 결과 토큰·페어링 수치는 아직 코드가 없어서 충돌하는 부분이 없다.

## 실환경 확인 필요

### D10 — 저장소에는 실제 설정이 없다

- 문서 충돌이 실제로 있다.
  - `docs/adr-0001-compose-result-channel.md:46` 은 「reserved concurrency 30」이다.
  - `docs/measurement-2026-08-23.md:55,61-64` 는 「계정 한도 10, 미예약 10 을 남겨야 해서 예약 불가」다.
- 18건 중 429 는 동기 호출 시절의 측정이다(`adr-0001:56-57`). 「30건 전부 DONE」은 비동기 쪽이다(`measurement:12,17`). R4 의 해석이 맞다.
- `compose-lambda/README.md:91-92` 의 300초·재시도 2회는 설정 명령의 예시다.
- 10/25 에 읽기 전용으로 조회한 것은 런타임 정보뿐이다: java21, x86_64, 2048MB, UpdateRuntimeOn=Auto.
- **확인할 것**
  - 함수의 event-invoke-config(`MaximumEventAgeInSeconds`·`MaximumRetryAttempts`)
  - 예약 동시성
  - 계정 할당량

D08·D11 의 실환경 확인 항목은 각 항목 안에 적었다.

## 적합

- **D02:** 카메라 지원 확인(`getUserMedia`)이 이미 있다(`apps/web/app/shoot/capture/_hooks/useCaptureFlow.ts:155`). 「시작 전 점검」은 이것을 대기 화면으로 앞당기면 된다. iPhone Safari 는 일반 요소의 전체화면을 지원하지 않으므로 「전체화면 없이 완주」는 실제로 필요한 요구다.
- **D05**
  - 백엔드
    - `getComposableFrame` 은 시스템 프레임이면 `assertReadable` 을 건너뛴다(`BE: frame/service/FrameService.java:68-75`).
    - 요청의 `backgroundColor` 를 조립기에 그대로 넘긴다(`BE: media/service/ComposeService.java:71`).
    - 기획서가 인용한 대로다.
  - 프론트: 기존 `FramePicker` 는 고정 4종 `FrameId` 만 받는다(`apps/web/components/frame/FramePicker.tsx:14-20`). 행사 선택기는 새 컴포넌트로 만든다.
- **D06**
  - 백엔드
    - 업로드 용도는 PROFILE·FRAME·FRAME_COMPONENT·FOURCUT_SOURCE 넷이다(`BE: storage/enums/UploadType`).
    - 구운 텍스트 PNG 는 FRAME_COMPONENT 로 올라간다(`storage/strategy/FrameComponentUploadPathStrategy.java:10,15`).
    - 합성 단계는 TEXT 의 renderedKey 가 `uploads/` 아래인지만 본다(`media/compose/ComposeSpecAssembler.java:53,60`).
    - 그래서 호환 매핑과 「참가자 renderedKey 를 신뢰하지 않음」이 현재 구조와 맞다.
  - 프론트: 자유 문구를 열 때는 참가자 미리보기도 서버 렌더 결과로 보여 준다. 브라우저 canvas(Pretendard, `apps/web/lib/canvas/textLayer.ts:33-34`)와 서버 렌더러의 줄바꿈이 다를 수 있다.
- **D13:** 다음이 모두 코드와 맞다.
  - QR 생성 코드가 없다.
  - `requestFullscreen` 이 없다.
  - `BRIDGE_VERSION = 2` 와 기능별 최소 판 수 검사를 재사용한다(`apps/mobile/lib/native-bridge.ts:39`, `apps/web/lib/nativeBridge.ts:297`).
  - 기업 소개 문구를 고친다.
