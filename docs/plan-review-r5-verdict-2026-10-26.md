# 고도화 기획서 R5 — D01~D13 판정

2026-10-26 · 대상: 「하루컷 제품 고도화 기획서」 R5

- 판정은 세 가지다: **적합 / 수정 필요 / 실환경 확인 필요.**
- R5 의 「R5 변경 부분만 확인할 목록」과 연결된 본문·수용 기준만 봤다.
- 차이가 있는 것만 근거 코드와 최소 수정을 적었다. 사용자 결정과 바뀌지 않은 절은 다시 보지 않았다.
- 기준 커밋
  - 프론트: `harucut_FE` develop `c431f61`(앱 코드는 `abc1fe7` 과 같음)
  - 백엔드: `popeye0618/Harucut` main `8bab406`(작업 트리 깨끗)
- 프론트는 이 저장소에서 직접 확인했다. 백엔드는 하루컷 백엔드 세션이 확인했다.
  - 백엔드 근거에는 `BE:` 를 붙였다. 경로는 `src/main/java/com/harucut/` 기준이다.
- **실행한 것**
  - 프론트: 코드와 설치된 Next 16.4.3 문서(`node_modules/next/dist/docs/`)를 읽기만 했다.
  - 백엔드: 로컬 Gradle 캐시의 s3-2.25.67 jar 를 `javap` 로 확인했다(PutObjectRequest·HeadObjectRequest·HeadObjectResponse·ChecksumAlgorithm). 나머지는 코드와 문서만 읽었다.
  - **AWS·운영 DB·Vercel 에는 접속하지 않았다.** 사용자 허락을 받기 전이다. 그래서 실환경 항목은 모두 「미확인(접근 안 함)」이다. 확인할 때 쓸 읽기 전용 명령을 맨 아래에 적었다.
- 지난 판정(S56)의 백엔드 내용은 R5 에 정확하게 반영됐다(백엔드 확인).
- 지난 판정(S56)의 프론트 사실 중 틀린 것이 2건 있었다. 이번에 바로잡는다(D03, D07).

## 요약

| ID | 판정 | 한 줄 |
| --- | --- | --- |
| D01 | 적합 | 구현 메모 1줄 |
| D02 | 적합 | — |
| D03 | 수정 필요 | `public/favicon.ico` 는 없다(S56 오류). 파일 우선 규칙은 설치된 문서로 확인했다 |
| D04 | 적합 | 다른 탭 정리 통지는 지금 없는 신규 기능이다 |
| D05 | 적합 | — |
| D06 | 적합 | 서버 텍스트 렌더는 신규 기능이다 |
| D07 | 수정 필요 | 결과 Bearer 는 반드시 전용 체인에 둔다. BFF 에는 Origin 검사가 이미 있다. 회원 부수 처리가 하나 더 있다 |
| D08 | 적합 + 실환경 미확인 | S3 CORS·버전 관리·암호화, 테스트 버킷 412 |
| D09 | 수정 필요 | 계약 방향은 맞다. 빠진 전제 4개와 409 처리를 적는다 |
| D10 | 적합 + 실환경 미확인 | Lambda 실제 설정 |
| D11 | 적합 + 실환경 미확인 | 표에 key 접두사 제약 한 줄 추가. 운영 스키마 |
| D12 | 수정 필요 + 실기기 확인 | 외부 브라우저 전환이 fragment 를 다루는 방식이 R5 규칙과 충돌한다 |
| D13 | 적합 | — |

## 수정 필요

### D03 — `public/favicon.ico` 는 없다

- **사실 정정(S56 의 프론트 오류)**
  - `public/` 에는 `favicon.ico` 가 없다. 저장소에서 추적하는 ico 는 `apps/web/app/favicon.ico` 하나다.
  - 그래서 `/favicon.ico` 직접 요청도 이 파일 규칙이 응답한다.
  - R5 18절 「app/favicon.ico와 public/favicon.ico의 하루컷 자산」을 「app/favicon.ico(파일 규칙. `/favicon.ico` 직접 요청도 이 파일이 응답)」로 고친다.
- **R5 가 맞는 것(설치된 문서로 확인)**
  - 파일 메타데이터가 `metadata` 객체·`generateMetadata` 보다 우선한다(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:114`).
  - `favicon` 은 루트 `app/` 에만 둘 수 있다. 경로별로 다르게 하려면 `icon` 규칙을 쓴다(`…/03-file-conventions/01-metadata/app-icons.md:18,65`).
  - 세그먼트별 metadata 는 얕게 병합되고, 같은 키는 뒤 세그먼트가 덮는다(`generate-metadata.md:1346-1348`).
    - 그래서 루트 `layout.tsx:25-31` 의 `icons`(favicon-32/16 png, apple-touch-icon)와 `manifest`·`openGraph` 는 행사 레이아웃이 같은 키를 지정하면 바뀐다.
    - 하지만 `app/favicon.ico` 는 파일 규칙이라 그대로 남는다. 「중립 링크 하나 추가로 끝내지 않는다」는 R5 판단이 맞다.
- **구현 후 확인:** 배포 빌드의 head 와 `/favicon.ico` 응답을 확인한다(R5 F35 와 같음).

### D07 — 결과 Bearer 의 체인, BFF 의 기존 검사, 회원 부수 처리

- **백엔드 — 빠진 전제 1개**
  - 회원 `JwtAuthenticationFilter` 도 `Authorization: Bearer` 를 읽는다. 쿠키가 없으면 헤더를 본다(`BE: auth/security/JwtAuthenticationFilter.java:86-88,105`).
  - 그래서 결과 API 가 회원 체인에 떨어지면, 결과 토큰을 회원 JWT 로 파싱하다 실패한다.
    - PUBLIC 에 없는 경로면 401 이 난다.
    - PUBLIC 에 넣으면 무시된 채 통과한다.
  - 15절 「전용 SecurityFilterChain과 회원 쿠키 분리」에 추가할 문장:
    - 「`/api/public/results/**` 는 반드시 전용 체인의 securityMatcher 에 포함한다. 회원 체인의 JwtAuthenticationFilter 는 `Authorization: Bearer` 를 회원 JWT 로 해석하므로, 결과 Bearer 요청이 그 체인을 지나면 안 된다.」
  - CSRF 정정, 커스터마이저 수정 방향, ResultAccess 별도 bearer 스킴, 고정 경로는 코드와 맞다(`BE: SecurityConfig.java:47`, `ApiErrorDocumentationCustomizer.java:72,108-114`, `OpenApiConfig` 에 전역 security 없음).
- **프론트 — BFF 에는 Origin 검사가 이미 있다**
  - BFF 프록시는 GET 이 아닌 요청에서 `Sec-Fetch-Site`(없으면 `Origin`)를 보고, 같은 출처가 아니면 403 `CLIENT-005` 로 막는다(`apps/web/app/api/client/_proxy.ts:105-110,117-119`).
  - R5 15절 「브라우저→BFF 및 쿠키를 받는 API 경계에서 … 새로 적용」을 나눠 적는다.
    - 브라우저→BFF: 「기존 BFF 의 Sec-Fetch-Site/Origin 검사를 참가자·부스·결과 BFF 경로에도 적용한다」. 새 경로가 같은 `forward()` 를 쓰면 자동으로 적용된다.
    - BFF→백엔드, 또는 브라우저가 백엔드를 직접 부르는 경계: 신규
- **프론트 — 회원 부수 처리는 재발급 말고 하나 더 있다**
  - `clientApi.ts` 의 `request()` 하나에 전송·오류 파싱과 회원 처리가 섞여 있다(`apps/web/lib/clientApi.ts:245-365`). 회원 처리는 둘이다.
    - 401 → 회원 refresh → 전역 세션 만료 처리(`:289-316`)
    - 403 `GEN-021` → `/api/auth/status` 조회 → 탈퇴요청 복구 안내(`:342-348`, `:125-139`)
  - R5 는 앞의 것만 적었다. 뒤의 것도 참가자·부스·결과 클라이언트에서 빼야 한다. 그렇지 않으면 탈퇴요청 상태의 회원이 행사 화면에서 복구 팝업을 받는다(F48).
  - 15절 「프론트 BFF와 경로 연결」의 「자격 선택·재발급·401 화면 처리는 나눈다」에 「403 GEN-021 의 탈퇴요청 확인」을 추가한다.
- **프론트 — 「쿠키를 보내지 않는 Bearer 요청」에 필요한 것**
  - 지금 전송은 `credentials: "include"` 로 고정이다(`clientApi.ts:269`). BFF 는 같은 출처라서, 결과 클라이언트는 `credentials: "omit"` 으로 보내야 회원 쿠키가 실리지 않는다.
  - BFF `forward()` 는 들어온 쿠키를 그대로 넘긴다(`_proxy.ts:130-140`).
    - `stripAuthCookies` 는 `accessToken`·`refreshToken` 만 뺀다(`:23-33`).
    - `Authorization` 헤더는 넘기지 않는다. `extraHeaders` 로만 넣을 수 있다(`:136`).
    - 그래서 결과 BFF 는 쿠키를 아예 넘기지 않고 결과 `Authorization` 만 명시적으로 넘긴다. 이것은 구현 메모이고, R5 방향과 같다.
- **S56 사실 정정(프론트 오류)**
  - S56 은 「재발급 예외는 두 경로뿐(`:65-68`)」이라고 적었다.
  - 실제로는 인증 관련 9개 경로다(`clientApi.ts:65-75`): reissue, login, register, 이메일 코드 2개, 비밀번호 재설정 3개, logout.
  - 결론(참가자 경로는 예외에 없다)은 같다. R5 는 「대부분의 401」로 적어 문제가 없다.

### D09 — 계약 방향은 맞다. 빠진 전제 4개

- **현재 코드**
  - Lambda 는 결과와 썸네일을 일반 `putObject` 로 차례로 올린다. 조건도 checksum 도 없다(`BE: compose-lambda/src/main/java/com/harucut/compose/lambda/ComposeHandler.java:68,76`).
  - 성공 응답은 `{"ok":true}` 뿐이다(같은 파일 `:82`).
  - 썸네일은 같은 렌더 호출에서 함께 만든다(compose-core `RenderResult(full, thumbnailJpeg)`). 그래서 「한 실행이 만든 한 쌍」 단위는 이미 성립한다.
  - SDK 2.25.67 에 필요한 API 가 다 있다(javap 확인).
    - `PutObjectRequest.checksumAlgorithm()`·`checksumSHA256()`
    - `HeadObjectRequest.checksumMode()`, `HeadObjectResponse.checksumSHA256()`
    - `ChecksumAlgorithm.SHA256`
    - If-None-Match 는 D08 과 같은 `putHeader` 방식이다. 이 기능 때문에 SDK 를 올릴 필요는 없다.
- **13절 「job별 고정 출력 key와 검증된 한 쌍의 성공 채택」에 추가할 전제**
  1. **checksum 알고리즘 명시**
     - writer 가 PutObject 에 `checksumAlgorithm=SHA256` 과 미리 계산한 `checksumSHA256`(base64)을 함께 보낸다.
     - 그래야 S3 가 받으면서 바이트를 검증하고(불일치면 BadDigest), `HeadObject(ChecksumMode=ENABLED)` 가 같은 SHA-256 을 돌려준다.
     - 지정하지 않으면 다른 기본 알고리즘으로 저장될 수 있어 SHA-256 대조가 안 된다(공식 문서 기준, 테스트 버킷 확인 필요).
     - 기존 결과 객체에는 SHA-256 checksum 이 없으므로 legacy 로 분류한다.
  2. **통지 계약 확장**
     - 소비자의 ResponsePayload 는 `errorType`·`errorMessage` 뿐이다(`BE: media/compose/ComposeResultNotification.java`).
     - Lambda 응답에 attemptNo, 결과·썸네일의 예상 SHA-256, 렌더 계약 버전을 넣고, 소비자 record 와 파서를 바꾼다.
     - Destination 성공 레코드에 responsePayload 가 실리므로 전달 경로는 있다.
  3. **검증 주체와 권한**
     - Lambda 실행 역할은 `uploads/*` 에 `s3:GetObject`·`s3:PutObject` 만 있다(`BE: compose-lambda/README.md:51-55`).
       - `HeadObject` + `ChecksumMode` 는 `s3:GetObject` 로 충분하다.
       - `GetObjectAttributes` 는 권한이 추가로 필요하다. 그래서 HeadObject 를 기준으로 쓴다.
       - SSE-KMS 라면 `kms:Decrypt` 도 필요하다(실환경 미확인).
     - 서버 소비자가 다시 HeadObject 로 확인하면 `handle()` 안에 S3 호출이 두 번 들어간다. `ComposeResultConsumer.java:53` 주석대로 가시성 타임아웃(30초)과 실패 처리를 함께 바꾼다.
     - 대안: 결과 큐의 SendMessage 를 Lambda 로만 제한한 큐 정책이 확인되면, 소비자는 재조회를 생략하고 Lambda 가 검증한 값을 신뢰할 수 있다(큐 정책은 실환경 미확인).
  4. **구형 writer 전환 장치**
     - 서버는 qualifier 없이 함수 이름으로만 invoke 한다. 그래서 항상 `$LATEST` 가 실행된다(`BE: media/compose/LambdaComposeExecutor.java:44,57`, `application.yaml` 의 `cloud.aws.lambda.compose-function`).
     - 「신형 job 에 구형 writer 가 쓰지 않음」을 보장하려면 둘 중 하나를 명시한다.
       - qualifier(버전·별칭)를 추가하고, payload 의 계약 버전으로 거부한다.
       - 구형 job 을 drain 한 뒤 `$LATEST` 를 교체한다.
- **함께 고칠 것**
  - 동시 실행이 같은 key 에 조건부 PUT 하면 412 말고 409(ConditionalRequestConflict)도 올 수 있다.
    - 16절 입력 쪽에는 409 가 있지만 13절 출력 쪽에는 없다.
    - 「Lambda writer 는 409 를 재시도 가능 오류로 처리한다」를 넣는다.
  - 삭제 기록과 지연 재삭제는 현재 기반이 전혀 없다. 「전부 신규 구현」이라고 적는다.
    - 지금은 커밋 뒤 한 번 지우고, 실패하면 로그만 남긴다(`BE: storage/event/S3DeleteListener.java:21-31`).

### D12 — 외부 브라우저 전환과 fragment 규칙이 충돌한다

- **근거 (프론트)**
  - 인앱 브라우저 탈출은 모두 `window.location.href` 를 쓴다. 그래서 `#token` 이 함께 넘어간다(`apps/web/hooks/useExternalBrowserRedirect.ts:12`).
  - 경로별로 이렇게 넘긴다.
    - LINE: `?openExternalBrowser=1` 만 붙인다. fragment 는 그대로다(`:104-106`). 문제없다.
    - 카카오톡: `kakaotalk://web/openExternal?url=` + 전체 링크 인코딩(`:97-99`).
      - R5 가 금지한 「`?url=전체결과링크` 같은 중계 주소」와 모양이 같다.
      - 다만 기기 안의 앱 스킴이라 웹 서버로 가지는 않는다.
    - 안드로이드 기타 인앱(인스타·페이스북·네이버 등): `intent://<host>/r#TOKEN#Intent;…;end` 가 된다. `#` 이 두 개 생긴다(`:119-125`).
      - 인앱 브라우저의 intent 해석기가 토큰을 보존하는지 코드로는 알 수 없다.
    - iOS 기타 인앱: 전체 링크를 클립보드에 복사한다(`:112`).
  - 전역 `Referrer-Policy` 는 `strict-origin-when-cross-origin` 이다(`apps/web/next.config.ts:11,32`).
  - `sitemap.ts` 에는 `/r`·`/e` 가 없다. 이미 R5 대로다.
- **수정**
  - 16절 「결과 링크·API·검색 노출」 5번에 예외를 정한다.
    - 고칠 문장: 「외부 웹 중계 서비스·서버로 링크를 보내지 않는다. 기기 안의 앱 스킴(`kakaotalk://`, `intent://`)으로 외부 브라우저를 여는 것은 허용하되, fragment 보존을 실기기로 확인한다.」
    - 이 예외가 없으면 카카오톡 안에서 연 결과 링크는 외부 브라우저로 나갈 방법이 없다.
  - 안드로이드 intent 경로는 fragment 가 있는 링크에서 깨질 수 있다고 적는다. 보존되지 않으면 `/r` 에서는 intent 대신 다른 방법을 쓴다(F51 에 포함).
    - 예: `S.browser_fallback_url` 만 쓰거나, 링크 복사 안내로 대신한다.
  - `/r` 의 `Referrer-Policy: no-referrer`·`Cache-Control: no-store` 는 `next.config.ts` `headers()` 에서 전역 규칙 **뒤에** `/r` 규칙으로 둔다고 적는다.
    - 같은 키는 마지막 규칙이 이긴다(`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md:47`).
    - 필요하면 같은 자리에서 `X-Robots-Tag: noindex` 도 줄 수 있다.
  - robots: S56 은 「`/r`·`/e` 를 robots 에서 막고 noindex 도 건다」고 권했다. R5 의 정정(robots 로 막으면 noindex 를 못 읽을 수 있다)이 맞다. R5 대로 간다.
- **실기기 확인 필요:** 카카오톡·인스타그램(안드로이드)·LINE·iOS 인앱에서 `/r#token` 을 열고, 외부 브라우저로 나간 뒤 fragment 가 남는지 본다.
- **백엔드**
  - 약관 정정 문구가 로컬 확인과 같다.
    - terms_agreement: user_id NOT NULL, users FK 없음, (user_id, terms_id) 유니크, terms_id FK
    - terms_agreement_history: user_id NOT NULL, 일반 인덱스 `idx_terms_agreement_history_user_id` 만 있음
  - 결과 API 의 Referrer-Policy·no-store 는 지금 백엔드에 설정이 없다(SecurityConfig 에 headers 설정 없음, Spring Security 기본값만). 「신규」라는 R5 기술이 맞다.
  - (선택) 「INCR·TTL」을 「INCR 와 EXPIRE(또는 SET NX EX + INCR, Lua)」로 쓰면 Redis 명령 이름과 맞다.

## 적합 + 실환경 미확인

### D08

- 다음은 모두 코드와 맞다.
  - SDK 상향 필수 철회
  - 호출별 TTL
    - `EXPIRY` 하나를 PUT(`:63`)·GET(`:113`)이 같이 쓴다(`BE: storage/service/S3FileStorageService.java:28`).
    - 인터페이스에도 TTL 인자가 없다(`BE: storage/service/FileStorageService.java:10`).
  - 서명 헤더 목록 추가
- 프론트: 지금 S3 PUT 은 `Content-Type` 만 보내고 쿠키·Authorization 을 싣지 않는다(`apps/web/lib/presignedUploadApi.ts:347-353`). R5 의 「S3 에 결과·회원 Authorization 을 전달하지 않는다」를 이미 지킨다.
- **미확인(접근 안 함):** 버킷 CORS·버전 관리·암호화. 조건부 PUT 의 412 는 쓰기가 필요하므로 테스트 버킷에서만 확인한다.

### D10

- README 300초·2회를 「명령 예시」로 정정한 것이 맞다(`BE: compose-lambda/README.md:89-92`).
- **미확인(접근 안 함):** event-invoke-config, 예약 동시성, 계정 한도, 별칭·버전, 결과 큐 속성, Lambda 실행 역할.

### D11

- 17절 「현재 User 전제 경로」 표는 지난 회신의 9곳을 빠짐없이 담았다. `findStalled` 의 「조용한 누락」 경고도 정확하다.
- **표에 한 줄 추가:** key 접두사 제약
  - `S3Keys.isManagedKey` 는 `uploads/` 접두사만 관리 대상으로 본다(`BE: storage/util/S3Keys.java:12,19-21`).
  - `ComposeSpecAssembler.java:60` 이 이 검사로 합성 자산을 거른다.
  - Lambda IAM 도 `uploads/*` 에만 권한이 있다(`compose-lambda/README.md:53`).
  - 그래서 행사 StorageScope key 를 `uploads/` 밖에 두면 합성 거부와 Lambda 403 이 동시에 난다.
  - `resultKeyFor` 행에 덧붙일 문장: 「행사 key 도 `uploads/` 아래에 두거나, `isManagedKey` 와 Lambda IAM 을 함께 확장한다.」
- **미확인(접근 안 함):** 운영 DB 의 `compose_job`·`user_media`·`terms_agreement`·`terms_agreement_history` 스키마

## 적합

- **D01:** R5 대로다. 구현 메모 1줄.
  - 촬영 초안 검증이 `eventName` 필드를 검사한다(`apps/web/lib/shootSessionStorage.ts:54`).
  - 이 검사가 실패하면 store 전체를 지운다(`:62-66`).
  - 필드를 없앨 때는 검사도 함께 없애서, 필드가 남은 옛 초안이 「무효」가 되어 통째로 지워지지 않게 한다. R5 의 「무관한 개인 초안을 통째로 지우지 않는다」와 같은 뜻이다.
- **D02:** R5 대로다.
- **D04:** R5 대로다.
  - `store.clear()`(`shootSessionStorage.ts:64,71,143`)와 전역 표식(`shootSessionPersistence.ts:13`)이 실제 대상이다.
  - 「다른 탭에 보내는 정리 통지」는 지금 코드에 없다(BroadcastChannel·storage 이벤트 없음). 「나눈다」가 아니라 필요하면 새로 만드는 것이다. 판정에는 영향이 없다.
- **D05:** 백엔드와 충돌하지 않는다.
- **D06:** 백엔드와 충돌하지 않는다. 서버 텍스트 렌더(미리보기 포함)는 지금 코드에 없는 신규 기능이다. 지금 TEXT 는 브라우저가 구운 PNG 뿐이다.
- **D13:** R5 대로다.

## 실환경 확인 — 접근하지 않음

모두 읽기 전용 명령이다. 사용자 허락을 받은 뒤 실행하고, 결과에는 계정·리전·대상·시각을 남긴다.

- **D08 (S3)**
  - `aws s3api get-bucket-cors --bucket harucuts3`
  - `aws s3api get-bucket-versioning --bucket harucuts3`
  - `aws s3api get-bucket-encryption --bucket harucuts3`
  - 조건부 PUT 412·409·헤더 변조 거부는 쓰기가 필요하므로 **테스트 버킷**에서만 확인한다.
- **D09·D10 (Lambda·SQS·IAM)**
  - `aws lambda get-function-event-invoke-config --function-name harucut-compose`
  - `aws lambda get-function-concurrency --function-name harucut-compose`
  - `aws lambda get-account-settings`
  - `aws lambda list-aliases --function-name harucut-compose`
  - `aws lambda list-versions-by-function --function-name harucut-compose`
  - `aws sqs get-queue-attributes --queue-url <결과 큐 URL> --attribute-names RedrivePolicy Policy VisibilityTimeout`
  - `aws iam list-attached-role-policies --role-name <Lambda 실행 역할>` / `aws iam get-role-policy …`
- **D11·D12 (운영 DB, SSH 터널)**
  - `SHOW CREATE TABLE compose_job; SHOW INDEX FROM compose_job;`
  - `SHOW CREATE TABLE user_media;`
  - `SHOW CREATE TABLE terms_agreement; SHOW CREATE TABLE terms_agreement_history;`
- **D03·D12 (구현 후)**
  - 배포 빌드의 head, `/favicon.ico` 응답
  - Vercel Runtime Logs 에 `/r` 요청 경로만 남는지
  - 인앱 브라우저별 fragment 보존(실기기)
