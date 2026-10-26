# 고도화 기획서 R4 재검수 — 프론트

2026-10-26 · 대상: 「하루컷 제품 고도화 기획서」 R4

- R4 의 요청대로 **D01~D13 변경분만** 봤다. 바꾸지 않은 절과 새 기능 제안은 다루지 않는다.
- 프론트 기준 커밋: `c431f61`(develop). 앱 코드는 `abc1fe7` 과 같다. 코드는 고치지 않았다.
- 백엔드 변경분(D04·D05 일부, D06~D12)은 백엔드 세션이 검수했다(아래 「백엔드 재검수」).
- 기획서에 보낼 것은 「프론트: R5 에 반영 요청」과 「백엔드: R5 에 반영 요청」 두 절이다.
- 프론트와 백엔드가 따로 같은 결론에 닿은 곳이 둘 있다.
  - D06: 서버 렌더 문구의 미리보기는 서버와 같은 폰트·줄바꿈을 써야 한다.
  - D12: 결과 토큰이 새는 곳은 API 가 아니라 프론트 `/r` 페이지다.
- 지난 검수: `docs/plan-review-r3-2026-10-26.md`(기획서의 S38).

## 총평

- 프론트 관련 D01~D04, D13 은 R3 검수 내용을 정확히 옮겼다. 사용자 결정 3건도 그대로 반영됐다.
- 어긋나는 곳은 5건이다. 모두 「코드에 없는 것을 있다고 봤다」거나 「현재 코드 구조 때문에 R4 문구대로는 안 되는」 경우다. 방향을 바꿀 것은 없다.

## 판정

| ID | R4 내용 | 판정 | 근거와 제안 |
| --- | --- | --- | --- |
| D01 | 옛 `/shoot?event=` 제거, 기업 화면의 링크 생성부도 전환, 옛 주소에는 「새 링크 확인」 안내 | **보완** | 아래 1 |
| D02 | 기종 지정 대신 지원 조건, 전체화면은 선택, 행사 테마 우선 | 맞음 | 아래 「맞음」 |
| D03 | 루트 메타데이터·전역 브리지 분리, 중립 OG·아이콘, `--hc-*` 토큰 | **보완** | 아래 2 |
| D04 | 촬영 저장소를 `eventId·runId(·deviceId)` 이름공간으로 분리, origin 전체 삭제 금지 | **보완** | 아래 3 |
| D05 | 행사 선택기는 서버 목록만, `useRemoteFrameTheme` 표시 로직 재사용 | 맞음, 한 줄 보완 | 아래 4 |
| D06 | 참가자 TEXT_RENDER 업로드 금지, 자유 문구는 서버 렌더 | 맞음, 한 줄 보완 | 아래 5 |
| D07 | BFF·전역 응답 인터셉터도 참가자 자격과 회원 JWT 를 섞지 않음 | **보완** | 아래 6 |
| D08 | presign 응답의 서명 헤더를 프론트가 그대로 보냄, 412·409 복구 | 맞음, 한 줄 보완 | 아래 7 |
| D12 | 결과 토큰을 경로(`/r/{token}`)에 두고 로그에서 제거 | **보완** | 아래 8 |
| D13 | QR 생성·선택적 전체화면 신규, `BRIDGE_VERSION=2` 확장, 기업 소개 문구 | 맞음 | 아래 「맞음」 |

## 상세

### 1. D01 — 「기업 화면의 링크 생성부」는 없다. 옛 주소 안내 화면도 필요 없다

- 기업 화면은 행사 링크나 QR 을 만들지 않는다.
  - `EnterpriseView.tsx` 의 링크는 `#inquiry`, `/features` 둘뿐이다(`apps/web/components/enterprise/EnterpriseView.tsx:70,76`).
  - 문의 폼의 `eventName` 은 문의 메일 본문에 넣는 값이다(`apps/web/components/enterprise/EnterpriseInquiryForm.tsx:16,55`). 행사 쿼리와 무관하므로 **지우면 안 된다.**
  - QR 은 지금 운영자가 손으로 만들어 전달한다.
- 그래서 R4 4절의 「기업 화면의 링크 생성부를 함께 전환」과 F47 의 「옛 QR 생성 경로 제거」는 대상이 없다. 「Studio 에 참가 링크·QR 생성을 새로 만든다」로 고친다.
- 「옛 행사 파라미터가 든 주소는 새 링크 확인을 안내한다」도 빼기를 권한다. 배포된 QR 이 없어(사용자 결정) 그 화면을 볼 사람이 없다. `event` 쿼리를 무시하고 일반 `/shoot` 으로 동작하면 충분하다.
- 실제로 걷어낼 곳(참고):
  - `apps/web/app/shoot/{page,select/page,capture/page,result/page,upload/page}.tsx`
  - `apps/web/components/event/EventBanner.tsx`, `apps/web/lib/eventName.ts`
  - `apps/web/lib/shootSessionStore.ts`·`shootSessionPersistence.ts`·`shootSessionStorage.ts` 의 `eventName` 필드
  - 관련 테스트

### 2. D03 — 아이콘은 파일 규칙이라 metadata 로 못 덮을 수 있다. 테마 스크립트도 옮겨야 한다

- 파비콘이 두 군데에 있다.
  - `apps/web/app/favicon.ico` 는 Next 의 루트 전용 파일 규칙이다. 모든 경로에 붙는다.
  - `public/favicon.ico` 도 있다. 브라우저는 아이콘 링크가 없으면 `/favicon.ico` 를 직접 요청한다.
- 그래서 행사 레이아웃에서 `metadata.icons` 만 지정하면 하루컷 아이콘이 남을 수 있다. 행사 경로에는 **중립 아이콘 링크를 명시**해야 한다. `app/favicon.ico` 를 metadata 기반으로 바꿀지도 함께 정한다.
  - 파일 규칙과 metadata 객체 중 무엇이 이기는지는 설치된 Next 16.4.3 문서(`node_modules/next/dist/docs/`)로 구현 때 확인한다. 이번에는 확인하지 않았다.
- 매니페스트(`public/site.webmanifest`)와 `og-image.png` 도 같은 방식으로 점검한다(F35).
- `ColorThemeScript` 가 루트 `<body>` 첫 줄에서 첫 페인트 전에 `data-theme` 을 심는다(`apps/web/app/layout.tsx:69`, `apps/web/lib/colorTheme.ts:157`). 이것을 행사 경로에서 끄지 않으면 F50 의 「첫 렌더 깜박임 없음」을 지킬 수 없다. 브리지와 함께 일반 서비스 쪽으로 옮겨야 할 목록에 넣는다.
- `ExternalBrowserGate`(인앱 브라우저 → 외부 브라우저)는 행사에도 필요하다. 루트에 남긴다. R4 의 「카메라·기기 브리지는 끄지 않는다」와 같은 취지다.

### 3. D04 — 지금 저장소는 「이상하면 통째로 비운다」. 이름공간만 나누면 다른 칸까지 지워진다

- 촬영 임시 보관소는 IndexedDB `harucut-shoot-session` 의 store 하나다.
- 읽을 때 메타가 만료됐거나 깨졌으면 `store.clear()` 로 **store 전체를 비운다**(`apps/web/lib/shootSessionStorage.ts:61-73`). 지울 때도 `clear()` 다(`:143`).
- 「삭제했음」 표시도 출처 전체에 하나다(`localStorage` `harucut:shoot-cleared-at`, `apps/web/lib/shootSessionPersistence.ts:11`). 이 값이 있으면 다음 초기화 때 초안을 지운다.
- 그래서 같은 store 안에서 키만 `eventId·runId` 로 나누면, 한 회차가 만료될 때 개인 초안과 다른 탭의 행사 초안까지 지워진다. R4 의 「origin 전체 삭제로 훼손하지 않음」(F25)과 정반대다.
- **R4 에 적을 것:** 이름공간 분리는 키 접두사만 바꾸는 일이 아니다. `clear()` 를 이름공간 단위 삭제로 바꾸고, 삭제 표시도 이름공간별로 둔다. 행사 흐름은 아예 별도 DB 이름을 쓰는 편이 단순하다.

### 4. D05 — 기존 `FramePicker` 는 재사용할 수 없다

- `FramePicker` 는 고정 4종의 `FrameId` 만 받는다(`apps/web/components/frame/FramePicker.tsx:14-20`). 목록을 밖에서 넣는 prop 이 없다.
- 행사 선택기는 「레이아웃 → 발행 프레임」 두 단계 목록을 받는 새 컴포넌트가 필요하다. 시각 요소(카드, 미리보기)만 재사용한다.
- R4 의 「useRemoteFrameTheme 표시 로직 재사용, 조회 API 는 참가자 경로로 분리」는 맞다.

### 5. D06 — 서버 렌더 문구는 미리보기도 서버 결과로 보여야 한다

- 지금 편집기의 글자는 브라우저 canvas 로 굽는다. 기본 서체는 Pretendard 다(`apps/web/lib/canvas/textLayer.ts:33-34`).
- 참가자 자유 문구를 서버가 렌더하면, 브라우저 canvas 와 서버 렌더러의 줄바꿈·자간이 다를 수 있다.
- 그래서 참가자 화면의 미리보기는 브라우저로 흉내 내지 말고 **서버 렌더 결과를 받아 보여 준다**. 「미리보기 = 최종 합성」(F12·F14)을 지키는 가장 단순한 방법이다.
- 첫 시연은 고정 문구라 지금 당장은 영향이 없다. 자유 문구를 열 때의 조건으로 적어 둔다.

### 6. D07 — 전역 재발급 로직을 참가자 요청이 타지 않게 해야 한다

- 브라우저 API 클라이언트는 **모든 401 에** 회원 토큰 재발급을 한 번 시도한다. 실패하면 전역 「세션 만료」 처리를 부른다(`apps/web/lib/clientApi.ts:289-320`). 예외는 재발급·로그인 경로 두 개뿐이다(`:65-68`).
- 참가자·부스·결과 요청이 이 클라이언트를 쓰면 다음 일이 생긴다.
  - 참가자 세션 만료(401) → 회원 refresh 회전 → 「로그인이 만료됐어요」 처리.
  - F48 에서 금지한 상황이다.
- **R4 에 적을 것:** 참가자·부스·결과 요청은 회원 재발급 로직이 없는 별도 클라이언트를 쓴다. 401 은 참가 흐름이 직접 처리한다. 경로 예외 목록에 하나씩 추가하는 방식보다 클라이언트를 나누는 편이 안전하다.

### 7. D08 — 지금 업로드는 헤더를 직접 정한다

- S3 PUT 은 프론트가 헤더를 직접 정해 보낸다(`apps/web/lib/presignedUploadApi.ts:347-350`).
- R4 처럼 서버가 준 서명 헤더를 그대로 보내려면 이 함수를 행사용으로 따로 두거나 시그니처를 바꿔야 한다. 개인 업로드 경로는 백엔드가 개인 presign 을 바꾸기 전까지 그대로 둔다.
- `If-None-Match` 는 CORS 사전 요청(preflight)이 필요한 헤더다. 지금도 PUT 이라 preflight 는 이미 나가고 있다. 그래서 늘어나는 비용은 없다. S3 CORS `AllowedHeaders` 만 맞추면 된다(R4 와 같음).

### 8. D12 — 토큰을 경로에 두면 「로그에서 제거」를 지킬 수 없다. `#` 뒤로 옮기기를 권한다

- R4 는 `/r/{token}` 을 쓰면서 「앱·BFF·프록시 접근 로그에서 토큰을 제거」하라고 한다.
- 웹은 Vercel 에서 돈다. Vercel 의 요청 로그는 경로를 그대로 남긴다. 우리가 지울 수 없다.
- 카카오톡 같은 링크 미리보기는 **카카오 서버가** 그 URL 을 가져간다. R4 가 「첫 스캔에 폐기하지 않는다」고 한 이유가 이것이다. 경로에 토큰이 있으면 그 토큰이 외부 서버로 간다.
- **제안:** 결과 링크를 `/r#{token}` 형태로 만든다.
  - `#` 뒤(fragment)는 브라우저가 서버로 보내지 않는다. 그래서 Vercel 로그, 미리보기 크롤러, Referer 어디에도 남지 않는다.
  - 페이지가 열리면 스크립트가 fragment 를 읽어 결과 API 를 부른다. QR 에 넣는 데도 문제가 없다.
  - 대가: 결과 페이지를 서버에서 미리 그릴 수 없다. 개인 결과 페이지는 원래 OG 에 사진을 넣지 않으므로(R4 18절) 잃는 것이 없다.
  - 백엔드 API 는 바뀌지 않는다. 토큰은 지금처럼 요청 경로나 본문에 실어 보낸다. 바뀌는 것은 사용자에게 주는 링크 모양뿐이다.
- 검색 노출: 지금 `robots.ts` 는 보호 경로와 `/api/`, `/oauth2/` 만 막는다(`apps/web/app/robots.ts:9`). `/r`(그리고 공개 목록에 오를 필요 없는 `/e`)를 disallow 에 넣고, 페이지에 `noindex` 를 건다.
- 외부 분석 도구는 지금 설치돼 있지 않다(`apps/web/package.json` 에 analytics·sentry 계열 없음). 그래서 「외부 분석으로의 토큰 전달」은 지금은 해당 없고, 나중에 도구를 넣을 때의 조건이다.

## 맞음 (확인함)

- **D02:** 카메라 지원 확인(`navigator.mediaDevices?.getUserMedia`)이 이미 있다(`apps/web/app/shoot/capture/_hooks/useCaptureFlow.ts:155`). 「시작 전 점검」은 이것을 대기 화면으로 앞당기면 된다. iPhone Safari 는 일반 요소의 전체화면을 지원하지 않는다. 그래서 「전체화면 없이도 완주」(F50)가 실제로 필요한 요구다.
- **D13:** QR 생성 코드가 없다는 점, `requestFullscreen` 이 없다는 점, `BRIDGE_VERSION = 2` 와 기능별 최소 판 수 검사를 재사용한다는 점, 기업 소개 문구 수정. 모두 R3 검수와 같다.
- **사용자 결정 표:** 세 결정 모두 그대로 반영됐다. 「개인 화면 다크 모드 제거는 필수 범위가 아니다」도 사용자 의도와 맞다.

## 프론트: R5 에 반영 요청 (우선순위 순)

1. **D04:** 저장소 이름공간 분리에 「`store.clear()` 를 이름공간 단위 삭제로 바꾸고, 삭제 표시(`harucut:shoot-cleared-at`)도 나눈다」를 넣는다. 행사는 별도 DB 이름을 권한다.
2. **D07:** 참가자·부스·결과 요청은 회원 재발급(`clientApi.ts`)을 타지 않는 별도 클라이언트를 쓴다.
3. **D12:** 결과 링크를 `/r#{token}` 으로 바꾼다. 아니면 「Vercel 요청 로그와 미리보기 크롤러에 토큰이 남는다」를 수용 위험으로 적는다. `/r`·`/e` 는 robots 차단과 `noindex` 를 건다.
4. **D03:** 하루컷 아이콘은 `app/favicon.ico` 와 `public/favicon.ico` 파일 규칙으로 들어온다. 행사 경로에는 중립 아이콘 링크를 명시한다. `ColorThemeScript` 를 루트에서 일반 서비스 쪽으로 옮기는 목록에 넣는다.
5. **D01:** 「기업 화면의 링크 생성부 전환」, F47 의 「옛 QR 생성 경로 제거」, 「옛 주소 안내 화면」을 지운다. 대신 「Studio 참가 링크·QR 생성 신규」로 적는다. 문의 폼의 `eventName` 은 유지한다.
6. **D05·D06·D08:** 한 줄씩 보충한다. 새 행사 선택기 컴포넌트가 필요하다. 서버 렌더 문구는 서버 결과로 미리보기한다. 행사용 PUT 함수가 서명 헤더를 받는다.

## 백엔드 재검수

> **2026-10-26 정정:** 이 절은 하루컷 백엔드 세션이 아니라 하루컷이 아닌 다른 프로젝트의 백엔드 세션이 Harucut 저장소 파일을 읽고 낸 결과다. 하루컷 백엔드 세션의 판정은 `docs/plan-review-r4-verdict-2026-10-26.md` 에 있다. 둘이 다르면 그 문서를 따른다.

백엔드 세션이 백엔드 저장소(`popeye0618/Harucut`, 커밋 8bab406) 코드만 보고 검수했다. 코드는 고치지 않았다.
D01~D13 변경분 중 코드와 어긋나는 것만 적었다. 새 기능 제안은 없다.

- 로컬에서 직접 실행해 확인한 것이 둘 있다. 네트워크와 AWS 에는 붙지 않았다.
  - Jackson 3.1.7 직렬화 동작
  - SDK 2.25.67 의 presign 서명 헤더(가짜 자격증명)
- 경로는 따로 표시가 없으면 `src/main/java/com/harucut/` 기준이다.

### R3 백엔드 회신 정정 2건

1. 「Lambda 먼저 배포」는 D09 에 한해 틀렸다(아래 D09-c).
2. 「SDK 를 올려야 한다」는 과했다. 2.25.67 에서도 서명에 넣을 수 있다(아래 D08-b).

### 판정

| D | R4 내용 | 판정 | 제안 |
| --- | --- | --- | --- |
| D09-a | 실행마다 출력 key 를 따로 두고 winningOutputRef 로 채택 | **과함** | 결정적 key 유지 + 늦게 쓴 출력은 지연 재삭제 |
| D09-b | complete/fail 을 조건부 UPDATE 영향 행 수로 판정 | 맞음 | 구현 때 걸리는 곳 2개 |
| D09-c | 배포 순서 소비자·DB → Lambda → 발행 | 맞음(안전). D09 에서는 Lambda 단계가 할 일이 없음 | attemptNo 는 Integer/Long |
| D11 | 멱등 이관 6단계, 부스도 P scope | 맞음 | user 가 null 이면 깨지는 경로 4곳을 단계에 명시 |
| D08-a | 인가 → 조회 → 지문 비교 → 409 | 맞음. 지금 코드에 지문 비교 없음 | 동시 중복(지금 500) 경로, HeadObject 위치 |
| D06 | 참가자 업로드 금지, 서버 렌더, 첫 시연은 고정 문구 | 맞음 | 비용 정리 |
| D07 | 행사 체인 하나, CSRF/Origin 「유지」, 결과 토큰 `security: []` | **보완** | CSRF 는 유지가 아니라 신규. `security: []` 는 지금 문서 생성기가 덮어씀 |
| D08-b | If-None-Match presign, signedHeaders, S3 CORS, PUT 10분·GET 5분 | 맞음, 일부 보완 | SDK 상향 불필요. 만료는 호출별 인자 |
| D10 | 계정 한도·300초·재시도 2회를 실제 설정으로 확인 | 맞음 | `compose-lambda/README.md:77-92` 는 CLI 예시일 뿐 실제 설정이 아님 |
| D12 | 토큰·코드·동의·헤더 초기값 | 대체로 맞음 | Referrer-Policy 는 프론트 페이지에. no-store 는 이미 기본 |
| D04·D05 | 부스·참가자 조회, 행사 접수 검사 순서 | 맞음, 보완 | 조립기(Assembler)가 Frame 엔티티를 받음 |

### 상세

**① D09-a — 결정적 key 에서도 덮어쓰기 위험이 있는가: 거의 없다**

- 결과 key 는 서버가 정해 payload 로 보내고, Lambda 는 그 key 에 쓴다(`ComposeService.java:164-171`).
- 렌더러에는 시간·난수 입력이 없다. 같은 spec·원본이면 같은 그림이 나온다.
- S3 PUT 은 객체 단위로 원자적이다. 둘이 같은 key 에 쓰면 마지막 것이 남고, 섞인 객체는 생기지 않는다.
- 실제 위험은 둘이다.
  - (a) 사용자가 지운 뒤 늦은 실행이 다시 써서 고아 파일이 생긴다. 사진 삭제와 탈퇴 삭제 모두 해당한다(`media/service/UserMediaService.java:75`, `media/handler/UserMediaDeletionHandler.java:28-38`).
  - (b) 두 실행 사이에 Lambda 가 배포되면 본편과 썸네일의 버전이 다를 수 있다. 화면상의 차이뿐이다.
- 실행별 key 로 바꿔도 (a) 는 남는다. 다른 key 에 고아가 생길 뿐이다.
- 실행별 key 의 부작용
  - `user_media.s3_key` 유니크가 「같은 job 두 번 완료」를 더 이상 막지 못한다. 조건부 UPDATE 가 유일한 방어선이 된다.
  - 탈퇴 정리는 `compose_job.result_key` 만 모은다(`media/repository/ComposeJobRepository.java:27-28`). 진 쪽 출력은 따로 지워야 한다.
  - `jobs/{jobId}/…` 는 `users/{publicId}/` 밖이다. 접두사로 소유를 판정하는 곳과 어긋난다(`storage/controller/FileController.java:89-90`, `user/service/UserService.java:49`).
- 제안
  - 결정적 key 를 유지한다. 조건부 UPDATE 로 시도 번호와 무관하게 첫 성공을 채택한다.
  - 사진 삭제·탈퇴 때 「최대 실행 수명 뒤 한 번 더 삭제」를 둔다. 실행 수명은 D10 실제값으로 정한다.
  - 그래도 실행별 key 를 쓰려면 소유자 접두사 아래에 둔다(예: `users/{publicId}/fourcuts/job-{id}/{executionId}.jpg`, 행사는 행사 접두사).
- 「작업 세대」 비교도 지금은 필요 없다. spec 은 job 생성 때의 스냅샷이고 바꾸는 setter 가 없다(`media/entity/ComposeJob.java:74-77`).

**② D09-b — 조건부 UPDATE 로 바꿀 때 걸리는 곳**

- 지금 ComposeJob 에는 `@Version` 도 `@DynamicUpdate` 도 없다. complete/fail 은 더티 체킹이다(`ComposeJob.java:119-135`).
  - 그래서 complete 와 fail 이 겹치면, 나중에 커밋한 쪽이 DONE 을 FAILED 로 덮고 result_key·media_id 도 지운다.
  - 지금은 소비자가 스레드 1개이고 서버도 1대라 드러나지 않는다(`ComposeResultConsumer.java:87-88`). 서버를 늘리거나, 배포 중 두 버전이 겹치거나, 처리가 가시성 타임아웃 30초를 넘으면 드러난다.
- 선례: claim 이 이미 조건부 UPDATE 다(`ComposeJobRepository.java:34-42`).
- 걸리는 곳
  - (1) `@Modifying(clearAutomatically = true)` 뒤에 `job.getUser()` 를 지연 로딩하면 LazyInitializationException 이 난다. 필요한 id 는 UPDATE 전에 읽어 둔다.
  - (2) 한 트랜잭션 안의 순서: 조건부 UPDATE → 영향 행이 1 일 때만 UserMedia insert → media_id 기록 → 원장 COMMIT. 지금 트랜잭션 경계(`ComposeService.java:38`)는 그대로 맞다.
  - (3) 「검증된 성공」에 HeadObject 를 넣으면 통지 처리에 외부 호출이 붙는다. VisibilityTimeout 30초의 전제를 다시 봐야 한다(`ComposeResultConsumer.java:49-53` 주석).

**③ D09-c — 직렬화 기준 판정 (로컬 실행으로 확인)**

- Lambda 는 `JsonMapper.builder().build()` 로 payload 를 읽는다. Jackson 3.1.7 기본값은 다음과 같다.
  - 모르는 필드는 무시한다(`FAIL_ON_UNKNOWN_PROPERTIES = false`).
  - 없는 필드는 null 이 된다.
- Lambda 는 jobId 를 읽지 않고, key 도 서버가 정한다. Destination 통지는 원래 payload 를 그대로 돌려준다.
- 그래서 attemptNo·executionId 는 **Lambda 를 고치지 않아도** 옛 Lambda 를 그대로 통과해 돌아온다.
- 결론
  - R4 순서는 안전하다. 다만 D09 에서는 Lambda 단계가 할 일이 없다.
  - Lambda 선배포가 꼭 필요한 것은 Lambda 동작이 바뀌는 변경이다(D06 텍스트 Layer).
  - attemptNo 는 Integer/Long 으로 둔다. int 면 누락이 0 이 되어 legacy 와 구분할 수 없다.

**④ D11 — 6단계는 문제없다. 빠진 선행 작업이 있다**

- compose_job 에 쓰는 곳은 `ComposeJob.create` 하나다(`ComposeService.java:73`). 그래서 2단계는 한 곳만 고치면 된다.
- 참가자 job(user_id NULL)을 쓰기 전에 고칠 경로 4곳
  - `findStalled` 가 user 를 inner join 한다(`ComposeJobRepository.java:44-51`). 참가자 job 이 재투입에서 빠진다.
  - `ComposeService.findStalled` 의 `job.getUser().getPublicId()`(`:143`)가 NPE 를 낸다.
  - `completeJob` 의 `UserMedia.of(job.getUser()…)` 다. `user_media.user_id` 가 NOT NULL 이다(`UserMedia.java:21`).
  - `getJob` 이 `findByIdAndUser` 다(`:96`).
- 운영 ddl-auto 가 update 다(`application-prod.yaml:10`). 1·2단계를 배포하면 Hibernate 가 컬럼을 먼저 만든다. 그래서 D11 은 Flyway·validate 전환 뒤에 둔다.

**⑤ D08-a — 재생 경로에 지문 비교가 없다**

- `ComposeService.java:57-62` 는 key 가 같으면 본문과 상관없이 기존 job 을 돌려준다.
- 선례: 결제는 재생 때 targetTier 를 비교하고 409 PAY-006 을 낸다(`payment/service/PaymentService.java:106-110`).
- 동시 중복
  - 결제는 유니크 위반 예외를 잡는다(`PaymentService.java:77-81`).
  - 합성은 잡지 않아서 500 이 될 가능성이 크다(`common/exception/GlobalExceptionHandler.java:93`).
  - R4 흐름에 「유니크 위반 → 다시 조회 → 지문 비교」를 넣는다.
- 지문 컬럼이 필요하다. 대상은 frameId·sourceKeys·backgroundColor 다(`media/dto/ComposeRequest.java`).
- HeadObject 를 트랜잭션 안에서 하면 네트워크 호출 4번 동안 DB 커넥션을 잡는다. 커넥션 풀은 10개다. 재생 확인 뒤, 트랜잭션 밖에서 한다.

**⑥ D06 — 서버 렌더 비용 (방향은 맞음)**

- compose-core 의 Layer 는 「이미지 + 위치」뿐이다. 종류·문자열 필드가 없다(`compose-core/…/ComposeSpec.java:45-58`).
- Lambda 렌더러는 Java2D 를 쓰지만 글자 그리는 코드는 없다.
- 렌더 위치는 Lambda 를 권한다. Spring 은 908MB 서버에 부담을 더한다.
- 비용
  1. Layer 에 종류·문구·스타일 ID 를 추가한다. spec_json 8,000자 상한도 함께 본다.
  2. 글자 측정과 줄바꿈을 만든다.
  3. 한글 폰트를 번들한다. Lambda java21 런타임에 시스템 폰트가 없을 가능성이 크다(미확인). 번들 TTF 로 시제품을 먼저 확인한다. Lambda zip 한도는 50MB 다.
  4. 옛 Lambda 는 텍스트 Layer 를 처리하지 못하고 실패한다. 그래서 이 변경은 Lambda 를 먼저 배포한다.
  5. 프론트 미리보기도 같은 폰트와 줄바꿈 규칙을 써야 결과와 맞는다(프론트 5번과 같은 결론).
- 첫 시연의 고정 문구는 지금의 renderedKey 경로로 추가 비용 없이 된다.

**⑦ D07**

- 행사 체인 하나와 `FilterRegistrationBean enabled=false` 는 맞다. 지금 필터는 빈이 아니라 `new` 로 만든다(`config/SecurityConfig.java:68-71`).
- **CSRF 는 지금 전역에서 꺼져 있다**(`SecurityConfig.java:47`). Origin 검사도 없다. 그래서 「유지」가 아니라 행사 체인에 「추가」다.
  - 쿠키 SameSite 기본값은 Lax 다(`application.yaml:100-103`). Lax 는 같은 사이트의 다른 서브도메인에서 오는 요청을 막지 못한다.
  - 부스 기기가 헤더 토큰을 쓰면 CSRF 대상이 아니다. 참가자가 쿠키를 쓰면 Origin 검사나 CSRF 토큰이 필요하다.
- CORS 설정은 `/**` 에 등록돼 있지만, 새 체인도 `.cors()` 를 불러야 적용된다.
- OpenAPI `security: []` 는 그대로는 안 나온다.
  - 문서 커스터마이저는 security 가 비어 있지 않을 때만 건너뛴다. 빈 배열이면 cookieAuth 를 다시 붙인다(`config/openapi/ApiErrorDocumentationCustomizer.java:108-115`).
  - 자물쇠 여부도 `isPublic(path)` 로 정한다(`:72`). 그래서 결과 토큰 경로에 401 이 문서화된다.
  - 커스터마이저를 고쳐야 R4 표기가 나온다.

**⑧ D08-b — SDK 상향은 필수가 아니다**

- SDK 2.25.67 에는 `PutObjectRequest.ifNoneMatch` 가 없다. 대신 `overrideConfiguration(o -> o.putHeader("If-None-Match","*"))` 로 presign 하면 된다(로컬 확인).
  - 결과: `signedHeaders = [content-length, if-none-match, host, content-type]`. 서명에 실제로 들어간다.
  - 실제 S3 가 presign PUT 에 412 를 내는지는 스테이징의 실 S3 에서 한 번 확인한다.
- signedHeaders 는 지금 응답에 없다(key·url·mime·expiry 뿐, `S3FileStorageService.java:68`). R4 대로 추가한다.
- S3 CORS 는 저장소에 IaC 가 없어 확인할 수 없다. 지금도 preflight 가 나므로 AllowedHeaders 는 이미 무언가 설정돼 있을 것이다. `*` 이면 바꿀 것이 없다. 콘솔에서 확인한다.
- 만료: PUT 과 모든 GET 이 상수 하나(24시간)를 쓴다(`S3FileStorageService.java:28`). 이 상수를 5분으로 바꾸면 보관함 썸네일·보기 URL 도 5분이 된다. 만료를 호출별 인자로 받아 행사 경로에만 적용한다.

**⑨ D12**

- Cache-Control: Spring Security 기본 헤더(no-store 포함)가 이미 모든 API 응답에 붙는다. 새 체인도 그대로 물려받는다.
- Referrer-Policy: 토큰이 새는 곳은 API 가 아니라 프론트의 `/r/{token}` HTML 페이지다. 그 페이지 응답(Next)에 붙여야 효과가 있다. 프론트 8번(`#` 뒤로 옮기기)과 같은 문제를 가리킨다.
- IP 제한
  - 운영은 `forward-headers-strategy: native` 라 nginx 뒤에서도 클라이언트 IP 가 잡힌다.
  - 지금 시도 제한은 이메일 단위뿐이다. IP 제한은 새로 만들어야 한다.

**⑩ D04·D05**

- 「SYSTEM 조기 반환 금지」는 실제 코드와 맞다(`frame/service/FrameService.java:68-75`).
- 조립기(`ComposeSpecAssembler.assemble`)는 지금 상태 그대로의 Frame 엔티티를 받는다(`ComposeService.java:70-71`). FrameVersion 스냅샷을 받는 입구가 필요하다.
- job 조회는 `(jobId, user)` 하나뿐이다(`:93-99`). 참가자·부스 조회는 새로 만든다.

### 백엔드: R5 에 반영 요청 (우선순위 순)

1. **D09-a:** 실행별 출력 key 를 다시 검토한다. 결정적 key + 조건부 UPDATE 첫 성공 채택 + 늦게 쓴 출력의 지연 재삭제면 충분하다. 그래도 유지하면 둘을 적는다: 소유자 접두사 아래에 둔다, s3_key 유니크가 이중 완료를 더 이상 막지 못한다.
2. **D07:** CSRF/Origin 을 「유지」에서 「행사 체인에 신규」로 고친다. 결과 토큰의 `security: []` 는 OpenAPI 커스터마이저를 고쳐야 나온다고 적는다.
3. **D08-a:** 동시 중복 경로(유니크 위반 → 다시 조회 → 지문 비교. 지금은 500)와 지문 컬럼을 명시한다. HeadObject 는 트랜잭션 밖에서 한다.
4. **D09-b:** `clearAutomatically` 뒤의 지연 로딩 문제를 적는다. HeadObject 를 통지 처리에 넣으면 VisibilityTimeout 30초를 다시 본다.
5. **D09-c:** D09 에서는 Lambda 단계를 생략할 수 있다. 텍스트 Layer(D06)는 Lambda 선배포가 필수다. attemptNo 는 박싱 타입이다.
6. **D11:** 참가자 job 을 쓰기 전에 고칠 user 비-null 경로 4곳과, Flyway·validate 선행 조건을 적는다.
7. **D08-b:** SDK 상향은 필수가 아니다(헤더 주입으로 서명 확인). 만료는 호출별 인자로 한다.
8. **D12:** Referrer-Policy 는 프론트 `/r` 페이지에 둔다. no-store 는 기존 기본 헤더로 충족된다.
9. **D06:** 고정 문구는 지금의 renderedKey 경로로 한다. 서버 렌더 전에 Lambda 한글 폰트 시제품을 확인한다.
