# 백엔드 계약 실측 (새 Java 백엔드)

측정: **2026-08-20**, `popeye0618/harucut:latest`, `http://localhost:8080`.
전부 **직접 호출해 확인한 값**이다. 스웨거만 보고 적은 것이 아니다.

백엔드가 넘긴 변경점 문서(`frontend-changes.md`, 2026-08-12)는 **두 군데가 실제와 다르다.**
문서보다 이 파일을 믿는다. 다시 확인하려면 `docs/local-backend.md` 대로 띄우고 아래를 재현하면 된다.

---

## 문서와 실제가 다른 곳

### 1. "Phase 3-3 라서 컨트롤러가 Auth/AuthStatus/Notice 뿐" → 아니다

`GET /v3/api-docs` 기준 **53개 경로**가 살아 있다.
frame · media · compose · subscription · payment · coupon · terms 전부 존재하고 실제로 응답한다.
문서가 쓰인 8/12 이후 8일간 백엔드가 더 나간 것으로 보인다.

→ **로컬 백엔드로 대부분의 화면을 돌릴 수 있다.** "auth 랑 공지밖에 안 된다"는 전제로 계획을 짜면 안 된다.

### 2. "변경점 #2 (GEN-021) 는 예정, 오늘 붙일 대상이 없다" → **이미 적용돼 있다**

`DELETED_REQUESTED` 토큰으로 일반 API 를 부르면 지금 바로 403 이 온다.

```
GET /api/auth/user/info   →  403 {"code":"GEN-021","status":403,"message":"Access denied."}
```

---

## 토큰

access JWT payload:

```json
{"sub":"kf5gic0WyJsx","iss":"Harucut","iat":…,"exp":…,
 "type":"ACCESS","role":"ROLE_USER","status":"ACTIVE"}
```

refresh 는 `{sub, iss, iat, exp, type:"REFRESH"}` — `role`·`status` 가 없다.

**`status` 가 토큰에 박혀 있다.** 서버는 이 클레임으로 인가한다. 발급 시점의 값이므로
DB 상태가 바뀌어도 **토큰을 새로 받기 전까지는 옛 상태로 동작한다.** 아래 탈퇴/복구 표가 전부 이것 때문이다.

변경점 #1(AUTH-011)은 실제로 적용돼 있다 — 확인함:

| 보낸 것 | 결과 |
|---|---|
| `Cookie: accessToken=<refresh>` | 401 `AUTH-011` |
| `Authorization: Bearer <refresh>` | 401 `AUTH-011` |
| `Authorization: Bearer <access>` | **200** (헤더 폴백은 살아 있다) |

Redis 키: `REFRESH_TOKEN:USER:<userId>`. reissue 하면 이전 refresh 가 `REFRESH_GRACE:<jwt>` 로 남는다(회전 유예).

---

## 탈퇴 요청 → 복구 생애주기 (실측)

| 단계 | 결과 |
|---|---|
| `DELETE /api/harucut/exit` | 200. 쿠키 둘 다 `Max-Age=0` 삭제. Redis refresh 키 삭제 |
| exit 직후 **기존** access 토큰으로 일반 API | **200 통과** (토큰 status 가 아직 ACTIVE) |
| 재로그인 | 200 `{"userStatus":"DELETED_REQUESTED"}`, **쿠키는 정상 발급** |
| 그 토큰으로 일반 API | **403 `GEN-021`** |
| 그 토큰으로 `GET /api/auth/status` | **200** `{"userStatus":"DELETED_REQUESTED"}` — 열려 있다 |
| 그 토큰으로 `POST /api/harucut/reissue` | 200. 단 새 토큰도 status 는 그대로 DELETED_REQUESTED |
| `POST /api/harucut/reactivate` | 200. **Set-Cookie 없음** + **Redis refresh 키 삭제** |
| reactivate 직후 같은 토큰으로 일반 API | **403 `GEN-021`** |
| reactivate 직후 `reissue` | **401 `AUTH-011`** (Redis 키가 지워져서) |
| reactivate 후 **재로그인** | 200 `ACTIVE`, 일반 API **200** |
| reactivate 두 번째 호출 | 400 `AUTH-007` |

### ⇒ 백엔드 문서의 지침 하나는 이 흐름에서 틀리다

문서: *"GEN-021 을 받아도 로그아웃시키지 말 것 — 토큰은 여전히 유효하다."*

탈퇴 취소를 **하기 전까지는** 맞다(그래서 복구 안내 화면으로 보낼 수 있다).
그러나 **`reactivate` 에 성공한 뒤에는 세션을 되살릴 방법이 없다.**
새 쿠키를 안 주고, reissue 마저 막힌다. 계정은 DB 상 복구됐는데 손에 든 토큰은 계속 403 이다.

**→ reactivate 성공 뒤에는 반드시 새 세션을 받아야 한다.**
이메일 로그인은 방금 입력받은 자격증명으로 재로그인하면 되고(사용자는 눈치채지 못한다),
소셜 로그인은 자격증명이 없으므로 소셜 인가를 다시 태워야 한다.

---

## 응답 봉투

```json
{"code":"GEN-000","status":200,"data":{ … }}
```

성공 코드는 **`GEN-000`**. `null` 필드는 응답에서 생략된다(`data` 없는 200 이 흔하다).
에러는 `{"code":"GEN-021","status":403,"message":"Access denied."}`.

---

## 에러 코드 전수 (실행 중인 jar 에서 추출)

```
GEN     001 002 003 004 005 006 011 021 031 041 051 091
AUTH    001 002 003 004 005 006 007 008 010 011 012 020 030 040 090 091
SUBS    002 003 004 005 006
PAY     001 002 003 006 007 008
FRAME   001
TERMS   001 002 003
COUPON  001 002 003 004 005 006 007 008
```

우리 맵에 없던 것 — 추가함:

| 코드 | 상태 | 서버 메시지 | 언제 뜨나 |
|---|---|---|---|
| `AUTH-008` | 400 | Social accounts do not have a password. | 소셜 계정에 비밀번호 재설정 시도 |
| `AUTH-040` | **429** | Too many verification requests. | 인증코드 재요청 쿨다운. **실제로 잘 걸린다** |
| `SUBS-006` | 400 | There is no auto-renewal to cancel… | 해지할 자동 갱신이 없을 때 |
| `COUPON-008` | 400 | Coupons cannot be used on an unlimited subscription. | 무제한 구독에 쿠폰 |

우리 맵에만 있고 서버엔 없는 코드(죽은 항목, 해는 없음):
`GEN-007/008/092/093/094`, `STOR-000`, `PAY-004/005/009/010`, `NOTICE-001`.

---

## 스키마 — 우리 타입과 다른 것

| 항목 | 우리 가정 | 실제 |
|---|---|---|
| `UserInfoResponse.id` | `number` | **`string`** (`"kf5gic0WyJsx"`) |
| `GET /api/auth/user/media` | — | **페이지 래퍼** `{content,totalElements,totalPages,number,size}` |
| `GET /api/notices` | — | 같은 페이지 래퍼 |
| `GET /api/auth/user/frame` | — | 평평한 배열 |
| `UserMediaResponse` | — | `thumbnailUrl`·`viewUrl` **신규**. `displayname`(소문자)·`originalFileName` 은 계약에 **없다** |
| `FrameResponse` | — | `cellCutouts: boolean[]` **신규** |
| `FrameCreateRequest` | — | `previewKey` **필수** (title·frameType·background 도 필수) |
| `ComponentRequest` | `key`/`style` | `id: string`, `renderedKey`, `styleJson` |
| `ComposeRequest` | — | 필드 **넷**. `frameId`·`sourceKeys[]`·`idempotencyKey` 필수 + `backgroundColor` 선택(`^#[0-9a-fA-F]{6}$`) — 「배경색은 요청에 실어 보낸다」 절 |
| `PresignedUploadRequest.type` | — | `PROFILE\|FRAME\|FRAME_COMPONENT\|FOURCUT_SOURCE` |
| `POST /api/auth/user/media` | 있다고 가정 | **없다 → 405 `GEN-041`** |

옛 업로드 타입 `FOURCUT_PHOTO` 는 **400 `GEN-006`** 으로 거부된다. 개명은 이미 끝났다.

BASIC 계정 실측 — ⚠️ **8-20 값이고 지금 서버와 다르다.** 8-28 이후 모든 등급이 무제한이다
(이 문서 맨 아래 절). 지금은 `frameRetentionLimit: -1`, 프레임 저장도 **200** 이다.

- `GET /api/auth/user/subscription/usage` → `{"planTier":"BASIC","frameRetentionLimit":0,"frameRetentionUsedCount":0,"frameRetentionRemainingCount":0,"frameRetentionUnlimited":false}`
- `GET /api/auth/subscriptions` → `{"planTier":"BASIC","status":"ACTIVE","autoRenew":false}`
- 프레임 저장 시도 → **403 `SUBS-003`** (한도가 0이라 첫 프레임부터 막힌다)

당시 BASIC 은 한도가 0이라 **"프레임 저장 후 목록 500"(`PRODUCT.md`) 를 이 계정으로 재현할 수 없었다.**
한도가 풀린 지금은 그 걸림돌이 없어졌다 — 다만 「목록 500」 자체는 **아직 해소됐다고 볼 근거가 없다.**


---

# 서버 합성 전환 (2026-08-20 실측·구현)

## 기본 프레임 = 시스템 프레임

`compose` 의 `frameId` 는 **내 프레임이거나 시스템 프레임**이어야 한다.
시스템 프레임은 관리자(`POST /api/admin/frames`, ROLE_ADMIN)가 만들고,
스웨거 말대로 **요금제 한도·보관 기간을 받지 않아 BASIC 계정 목록에도 항상 보인다.**

로컬에 4종을 등록해 확인했다. 반환 캔버스 크기가 `constants/frameLayouts.ts` 와 정확히 같다:

| frameType | canvas | 우리 FrameId |
|---|---|---|
| CLASSIC | 2000×6000 | classic-4 |
| WIDE | 6000×4000 | wide-4 |
| GRID | 4000×6000 | grid-4 |
| POLAROID | 4000×6000 | polaroid-4 |

슬롯 좌표는 백엔드 `FrameType.layout`(`Slot(x,y,w,h)` 4개)에 박혀 있다 —
프레임에 PHOTO 컴포넌트를 넣지 않아도 된다(`components: []` 로 등록해도 합성된다).

**id 를 코드에 박지 않는다.** 환경마다 다르므로 목록에서 `frameType` 으로 찾는다
(`lib/fourcutCompose.ts`의 `resolveComposeFrame`). 같은 종류가 여럿이면 **가장 먼저 등록된 것**을 쓴다 —
최신순 목록의 첫 번째를 집으면 프레임을 하나 더 올리는 순간 결과물이 조용히 바뀐다.

## 결과가 우리 미리보기와 픽셀 단위로 같다

색이 다른 4장을 CLASSIC 으로 합성해 결과 PNG 를 디코드하고 슬롯 중심을 찍었다.
`frameLayouts.ts` classic-4(left=150, top=200, imgW=1700, imgH=1200, gap=80) 기준으로
네 지점 색과 순서가 모두 일치했고, 모서리는 프레임 `background` 색 그대로였다
(`#FFFFFF` → rgb(255,255,255), `#1ed760` → rgb(30,215,96)).

## 필터는 프론트가 굽는다

스웨거가 `sourceKeys` 설명에 못박아 뒀다:
> ⚠️ **필터(흑백·밝게 등)는 올리기 전에 픽셀에 구워 넣어야 한다. 서버는 필터를 모른다.**

그래서 `lib/fourcutCompose.ts` 가 고른 4장을 **슬롯 크기로 자르고 필터를 입혀** JPEG 으로 올린다.
슬롯과 같은 비율·크기로 올리면 서버의 cover 배치가 1:1 이 되어 미리보기와 어긋날 여지가 없다.
(PNG 가 아니라 JPEG 인 이유: 슬롯 하나가 4MP까지 가서 PNG면 10MB 업로드 제한에 걸린다)

## 아직 막혀 있는 것

| 항목 | 왜 |
|---|---|
| ~~사용자가 고른 테두리색~~ | **해결됨(2026-08-28)** — `ComposeRequest.backgroundColor` 가 열렸고 프론트도 보낸다. 바로 아래 절 |
| ~~꾸미기(스티커·드로잉) 저장~~ | **해당 없음** — 이 제약 때문에 `/decorate` 기능 자체를 제거했다(2026-08). 프레임 꾸미기(`/theme/*`)는 그대로 남는다 |
| ~~비회원 결과를 로그인 후 기록으로~~ | **해결됨** — 완성본 대신 **원본 4장을 보관**했다가 로그인 후 합성한다(`lib/pendingGuestSave.ts`). 백엔드 수단 불필요 |
| ~~TEXT 가 든 프레임~~ | **해결됨(2026-08-21)** — 저장할 때 글자 층을 투명 PNG 로 구워 `renderedKey` 로 함께 보낸다(`lib/canvas/textLayer.ts`) |
| ~~정적 경로 스티커~~ | **해결됨(2026-08-21)** — 저장 직전에 S3 로 올려 `source` 를 key 로 바꾼다(`themeEditorStore.finalizeAssetsForSave`) |

**이 표에 남은 항목은 없다.** 백엔드에 남은 요청은 이 문서가 소유하지 않는다 —
[`docs/app-shell-backend-requests.md`](./app-shell-backend-requests.md) 가 정본이고,
여기 옮겨 적지 않는다. 테두리색이 정확히 그렇게 틀어졌다: 요청이 해결된 뒤에도 이 표에
「막혀 있음」으로 남아, 같은 문서 뒤쪽(「이번에 고친 어긋남」)과 정면으로 어긋났다.
해결 여부가 갈리는 항목은 한 곳에서만 관리한다.

### 배경색은 요청에 실어 보낸다 (2026-09-01 스키마 재확인)

`ComposeRequest` 의 필드는 **넷**이다. `frameId`·`sourceKeys`·`idempotencyKey` 가 필수이고
**`backgroundColor` 가 선택**으로 하나 더 있다(`pattern: ^#[0-9a-fA-F]{6}$`).
직접 보려면 `curl -s http://localhost:8080/v3/api-docs | jq '.components.schemas.ComposeRequest'`.

스웨거가 그 자리에 못박아 둔 세 가지 — 프론트가 지켜야 한다:

- **단색(`COLOR`) 배경 프레임에서만** 쓸 수 있다. 이미지 배경 프레임에 보내면 400 이다.
- 생략하면 프레임에 저장된 배경 그대로 합성한다.
- ⚠️ **같은 `idempotencyKey` 로 색만 바꿔 다시 보내면 무시된다** — 기존 작업이 그대로
  재생된다. 색을 바꿨으면 멱등키도 새로 잡아야 한다.

프론트는 이미 보낸다 — `lib/composeApi.ts:63`(타입),
`lib/fourcutCompose.ts:544` 의 `wantedBackgroundColor`(꾸민 프레임이면 색을 빼고
저장된 배경을 쓴다)와 `:398-409` 의 `submitCompose`(그래도 이미지 배경이라 400 이면
색만 빼고 한 번 더 보낸다), 호출부는 `app/shoot/result/page.tsx:366`(합성)과
`:525`(로그인 후 재합성).
회원 잠금과 우회 훅도 걷혔다: `components/frame/FrameOutputOptionsPanel.tsx:25-27` 의
`backgroundLocked` 는 이제 `hasCustomFrame` 이고(꾸민 프레임만 잠근다),
예전 이 자리에 적혀 있던 `hooks/useServerFrameBackground.ts` 는 **없는 파일**이다.

## 프레임 저장 형식 실측 (2026-08-21, 로컬 백엔드 · PRO 계정)

우리가 만드는 요청을 그대로 보내 합성까지 돌렸다.

| 확인한 것 | 결과 |
|---|---|
| `cellCutouts: [true,false,true,false]` 저장 | **그대로 응답에 돌아온다** |
| 그 누끼가 합성 결과에 반영되는가 | **된다** — 켠 칸만 가장자리가 어두워졌다(`rgb(55,9,10)` vs 끈 칸 `rgb(0,255,0)`) |
| `STICKER source = S3 key` | 202 → **DONE**, 결과에 그려짐(`rgb(255,0,128)`) |
| `TEXT` + `renderedKey` | 202 → **DONE**, 글자 층이 그려짐 |
| **옛 형식**(`/stickers/x.png` + `renderedKey` 없는 TEXT) | 프레임 저장은 **200**, 그 프레임으로 합성은 **400 GEN-002** |
| `background.value` 를 `#` 없이 `"23262d"` 로 | **먹는다** — 결과 배경 `rgb(35,38,45)` |
| 슬롯 좌표 | `frameLayouts.ts` classic-4 와 정확히 일치, 캔버스 2000×6000 |

### ⚠️ 누끼 한 줄은 지금 스웨거와 반대다 (2026-09-02 확인, 미해결)

위 표 두 번째 줄("합성 결과에 반영된다")과 **도는 서버의 설명이 정면으로 다르다.**

`FrameCreateRequest.cellCutouts` 의 스웨거 설명 전문:

> ⚠️ **서버는 이 값으로 아무것도 그리지 않는다** — 누끼(배경 제거 + 검은 배경)는
> 프론트가 원본 픽셀에 구워서 업로드해야 한다. 이 토글은 편집기가 저장 프레임을
> 다시 열 때 어느 칸이 누끼인지 복원하는 용도다.

**프론트는 스웨거를 따르기로 했다 — 지금은 원본 픽셀에 굽는다.** 회원 업로드 경로가 켜진
칸의 원본을 올리기 **전에** 사람만 남기고 배경을 검정으로 바꾼다
(`lib/fourcutCompose.ts` 의 `bakePersonCutouts` → `lib/canvas/personCutout.ts` 의
`cutoutPersonOnBlack`). 어느 칸이 켜졌는지는 합성에 쓰는 서버 프레임의 `cellCutouts` 에서
읽는다(`resolveComposeFrame`). 그래서 **서버가 그리든 안 그리든 회원 결과물에는 누끼가 있다.**

못 굽는 자리도 **던지지 않는다** — 누끼 하나 때문에 촬영 전체를 잃지 않는다.
모델을 못 받으면 그 칸만 원본으로 나가고, 프레임 조회가 흔들리면 전부 꺼진 것으로 보고 간다.

| 경로 | 누끼를 누가 굽나 |
|---|---|
| 회원(서버 합성) | **프론트가 업로드 전에** 원본 픽셀에 굽는다 |
| 비회원(브라우저 합성) | **아무도 안 굽는다** — 내려받는 그림에는 누끼가 없다 |
| 비회원 → 로그인 인계 | 보관한 원본을 회원 경로로 다시 올리므로 **그때 구워진다** |

비회원 경로에 있던 `composeFrame.ts` 의 `drawCellCutouts` 는 **없앴다** — 방사형 비네트 +
초록 링을 얹는 시각 효과였고, 스펙이 말하는 "배경 제거 + 검은 배경"과 무관했다. 그래서 지금은
비회원이 내려받는 그림과 로그인 뒤 기록에 남는 그림이 갈린다(뒤쪽에만 누끼가 있다).

**아직 미해결인 것은 하나로 줄었다:** `ComposeSpec.cellCutouts` 를 Lambda 가 실제로 그리는가.

| | 근거 |
|---|---|
| 서버가 그린다 (위 표) | 픽셀 실측 `rgb(55,9,10)` vs `rgb(0,255,0)`. jar 의 `ComposeSpecAssembler` 가 `Frame.getCellCutouts()` 를 읽어 `ComposeSpec` 에 싣는다 |
| 서버가 안 그린다 (스웨거) | 위 설명문. 실제 렌더는 jar 밖 Lambda(`LambdaComposeExecutor`)라 jar 만 봐서는 확정 못 한다 |

그린다면 **이미 구운 사진 위에** 실측에서 본 그 효과(켠 칸만 가장자리가 어두워짐)가 한 번 더
얹힌다 — 답이 오면 결과물을 눈으로 확인한다. 프론트가 굽는 쪽은 스웨거가 시킨 그대로라
어느 답이 와도 되돌리지 않는다. **확인 전까지 위 표의 "합성 결과에 반영된다" 줄을 근거로
삼지 말 것.**

**저장이 성공한다고 쓸 수 있는 프레임이 아니다.** 저장(200)과 합성(400)이 갈리는 것이
이 버그가 오래 안 보였던 이유다 — 사용자는 사진을 다 찍고 마지막 화면에서야 실패를 만났다.

### 응답의 `source` 와 `key` 는 다르다

`ComponentResponse.source` 는 **그릴 값**(PHOTO 는 presigned GET URL), `key` 는
**정규화된 순수 S3 key** 다. 스웨거가 못박아 뒀다 — *"수정 요청을 다시 만들 때 `source`
자리에 이 값을 넣는다."* 그래서 `toThemeExportJson` 은 `key` 를 `source` 로 되돌리고,
받은 URL 은 렌더 전용(`renderUrl`)으로 옮긴다. URL 을 그대로 저장하면 만료되는 주소가
프레임에 박히고 합성도 통과하지 못한다.

`renderedKey` 는 **응답에 실리지 않는다**(합성 전용). 그래서 저장된 TEXT 프레임을 다시
저장할 때는 글자 층을 **항상 새로 구워야** 한다 — 옛 key 를 재사용할 방법이 없고,
재사용하면 글자를 고쳤을 때 결과물만 조용히 어긋난다.

## 약관 동의 (2026-08-23 실측 — 로컬 백엔드에 관리자로 등록해 끝까지 확인)

| 엔드포인트 | 인증 | 비고 |
|---|---|---|
| `GET /api/terms` | **불필요** | 활성 약관 + **본문 전문**. 본문만 따로 받는 API 는 없다 |
| `POST /api/auth/terms/consents` | 필요 | 동의·철회 |
| `GET /api/auth/terms/consents/me` | 필요 | 활성 약관 **전체** 기준 |
| `POST /api/admin/terms` | 관리자 | 약관 + 버전1 생성 |
| `POST /api/admin/terms/{termsId}/versions` | 관리자 | 개정(코드 아님, **termsId** 다) |

**약관 목록은 서버 데이터다.** 관리자가 등록하기 전까지 `GET /api/terms` 는 **빈 배열**이고
`consents/me` 도 빈 배열이다(실측). 즉 프론트가 코드를 상수로 박으면 안 된다 —
없는 코드로 동의를 보내면 `TERMS-001` 이다. `code`·`title`·`required` 는 **한 번 정하면
고칠 수 없고**(수정 API 가 없다) 바꿀 수 있는 건 본문뿐이다.

### 함정 세 개 (전부 재현함)

| 하면 | 된다/안 된다 |
|---|---|
| 본문 최상위를 **배열**로 (`[{code, agreed}]`) | 200 |
| 객체로 감싸기 (`{items:[...]}`) | **400 GEN-006** |
| 필수 약관에 `agreed:false` | **400 TERMS-003** — 정책상 탈퇴로만 |
| 없는/비활성 코드 | **404 TERMS-001** |
| 선택 약관 동의 → 철회 | 200, `NOT_AGREED` 로 돌아가고 `agreedVersion` **키가 사라진다** |
| 동의한 적 없는 선택 약관에 `agreed:false` | 200 (무해) — 매번 전체를 보내도 된다 |

**전부 아니면 전무다.** 세 번째 항목에서 실패하면 앞의 두 개도 저장되지 않는다.
검증 실패는 `GEN-002` 하나로만 오고 **어느 항목이 왜 틀렸는지 알려주지 않는다**
(본문이 배열이라 필드 경로를 담는 `GEN-003` 형식을 못 쓴다) → 보내기 전에 프론트가 거른다.

### 개정 → 재동의

`POST /api/admin/terms/{id}/versions` 로 본문을 고치면 그 약관에 동의했던 사용자는
`NEEDS_RECONSENT` 가 된다(`agreedVersion` 은 옛 버전, `latestVersion` 은 새 버전).
재동의하면 `AGREED` + `agreedVersion = latestVersion`.

⚠️ **서버는 재동의를 강제하지 않는다.** 재동의하지 않아도 다른 API 는 전부 정상 동작한다.
언제 막을지는 프론트가 정한다 → 우리는 **보호 화면에서만** 막는다
(`components/terms/TermsConsentBridge.tsx`). 랜딩·약관 화면까지 막으면 무엇에 동의하는지
읽으러 갈 수조차 없다.

### 우리가 붙인 방식

동의 API 는 인증이 필요한데 우리 가입은 계정만 만들고 로그인시키지 않는다. 그래서
가입 화면이 고른 값을 `lib/pendingTermsConsent.ts` 에 하루짜리로 보관하고,
로그인 뒤 `TermsConsentBridge` 가 서버 장부에 기록한다. 소셜 로그인처럼 동의 화면을
거치지 않은 계정은 `NOT_AGREED` 로 잡혀 같은 재동의 화면이 받는다.

**동의 이력은 "법적 증빙용이라 수정·삭제되지 않는다."** 그래서 같은 동의를 두 번 보내면
장부에 두 줄이 남는다 — 브리지가 in-flight 가드를 두는 이유다.

### 남은 운영 과제 — 약관을 등록해야 기록이 시작된다

지금 어느 환경에도 활성 약관이 없다. 그때 프론트는 화면용 대체 목록으로 체크박스를
그리고(동의를 받는 의무는 지킨다) **기록은 건너뛴다** — 보낼 코드가 서버에 없기 때문이다.
관리자 API 로 `tos`·`privacy`·`marketing` 을 등록하는 순간 기록이 시작된다.
본문은 `packages/shared/src/legal.ts` 와 **같은 글**을 넣어야 한다. 다르면 "동의한 버전"과
"보여 준 글"이 갈려 증빙으로서 값이 떨어진다.

## 스티커·글자 실측 (2026-08-20 재현)

| 프레임 구성 | compose |
|---|---|
| `STICKER source="/stickers/heart.png"` (정적 경로) | **400 GEN-002** |
| `TEXT` 에 `renderedKey` 없음 | **400 GEN-002** |
| `STICKER source=<S3 key>` | 202 → **DONE** |
| `TEXT` + `renderedKey` | 202 → **DONE** |

**자산은 공용이어도 된다.** 성공한 두 건은 스티커·글자층이 *관리자* S3 루트에 있고 합성은
*다른 일반 사용자*가 돌렸는데 통과했다. 본인 소유여야 하는 것은 `sourceKeys`(원본 4장)뿐이다.
→ 기본 스티커 세트를 서버가 한 번만 올려 두면 사용자마다 중복 업로드하지 않아도 된다.

---

# 계약 재대조 (2026-09-01 재실행)

경로·죽은 프록시·에러코드(A·B·C)는 **손으로 읽지 않고 기계로 맞췄다.**
필수 요청 필드(D)만 여전히 손이다 — 스크립트가 「검사하지 않는다」고 스스로 출력한다.
같은 대조를 다시 하려면:

```bash
python3 scripts/check_backend_contract.py                  # A·B·C 요약
python3 scripts/check_backend_contract.py --show-required  # D 목록까지
```

⚠️ **`pnpm check:contract -- --show-required` 는 실패한다.** pnpm 이 `--` 를 그대로 넘겨서
argparse 가 `unrecognized arguments: -- --show-required` 로 거절한다(종료 2). pnpm 으로
돌릴 거면 `--` 없이 `pnpm check:contract --show-required` 다. 위의 `python3` 두 줄이 확실하다.

`scripts/check_backend_contract.py` 가 도는 백엔드의 `/v3/api-docs` 를 읽고,
에러코드는 **컨테이너 안 jar 의 ErrorCode enum** 에서 직접 뽑아 비교한다.
스웨거 응답 예시만 보면 문서화되지 않은 코드(`GEN-091` 같은 5xx)를 죽은 항목으로
잘못 짚기 때문이다 — 실제로 스웨거 기준 45개 vs jar 기준 52개로 갈렸다.

## A·B·C — 스크립트가 본 것 (2026-09-01 실행 · 2026-09-02 같은 digest 로 재실행, 결과 동일)

측정 대상은 `popeye0618/harucut@sha256:d2bdf90f191abcc7…`(2026-08-28 빌드)다.
**`:latest` 는 버전이 아니다** — 태그만 남기면 다음 사람이 같은 것을 쟀는지 알 수 없다.
이 문서의 8-20 블록이 통째로 낡은 근본 원인이 그것이라, 숫자를 적을 때는 digest 를 함께 적는다.

| 항목 | 결과 |
|---|---|
| 백엔드 규모 | 경로 53개 · (메서드, 경로) 쌍 62개 |
| A. FE 프록시 핸들러 → 백엔드 경로 | 핸들러 37개 · **37/37 OK** |
| B. 호출되지 않는 프록시 라우트 | **없음** |
| C. 에러코드 (jar 기준) ↔ FE 문구표 | 서버 52 · FE 52(+클라 1) · **누락 0 · 죽음 0** |

종료코드 0. **이 표는 그날의 출력이지 지금의 상태가 아니다.** 백엔드가 한 번 나가면
그날로 낡으니, 알아야 하면 위 명령을 다시 돌린다.
그리고 **이 숫자를 다른 문서로 복사하지 않는다** — 「프록시 핸들러 수」가 이 문서(33개)와
`docs/README.md`(37개)에 **같은 2026-08-28 날짜로 다르게** 적혀 있던 것이 이 규칙이 생긴 이유다.

## D. 필수 요청 필드 — 스크립트가 검사하지 않는다 (2026-09-01 손 대조 · 2026-09-02 재확인)

`--show-required` 는 **스웨거가 필수라고 적은 필드를 출력할 뿐**, 프론트가 실제로 그 값을
싣는지는 보지 않는다(요청 본문은 프록시가 아니라 `apps/web/lib` 에서 만들어져 정적으로 읽기
어렵다). 스크립트가 0 으로 끝나도 D 는 안 걸린다. 그래서 여기만 사람이 읽는다.

오늘 출력은 **16개 엔드포인트**다. 8-28 기록의 15개에서 하나 늘었다
(`PATCH /api/auth/user/media/{mediaId}/display-name`) — 손 대조가 그날로 낡는다는 증거다.
목록 자체는 명령으로 보고, 여기에는 **대조해서 나온 어긋남**만 남긴다.
전부 로컬 백엔드에 실제로 요청을 보내 재현했다.

9-01 대조에서 다섯 건이었다. **다섯 건 모두 그 뒤 프론트를 고쳐 맞췄다** — 아래
「이번에 고친 어긋남」 5·6·7(첫 세 건)과 8·9(D-4·D-5)로 옮겼다. 고친 것을 여기 결함으로
남겨 두면 다음 사람이 이미 고친 코드를 다시 고친다. **여기 남은 어긋남은 없다.**

⚠️ **다만 8(D-4)에는 프론트가 끝까지 못 닫는 갈래가 하나 남는다** — 우리 편집기 밖(다른
기기·다른 세션)에서 프레임을 고쳤고 이쪽 조회까지 실패한 경우다. 이건 프론트 결함이 아니라
`FrameResponse` 에 수정 시각이 없어서 생기는 것이라, 결함 목록이 아니라 백엔드 요청으로
들고 있다(`docs/app-shell-backend-requests.md` §6).

번호는 9-01 대조 그대로 둔다(D-4·D-5). 코드 주석과 리뷰 스레드가 그 번호로 이 문서를
가리키므로, 옮긴 뒤에도 「D-4」·「D-5」라는 이름은 살려 둔다.

⚠️ **다음에 이 절을 다시 채울 때**: `--show-required` 출력은 프론트가 그 필드를 실제로
싣는지 보지 않으므로, 스크립트가 0 으로 끝나도 여기는 사람이 다시 대조해야 한다.

## 이번에 고친 어긋남

1. **`ComposeRequest.backgroundColor` 가 열렸는데 안 쓰고 있었다.**
   회원에게 배경색 고르기를 막아 두고(`FrameOutputOptionsPanel.serverComposed`),
   미리보기를 서버 값에 맞추려고 프레임 목록을 한 번 더 조회했다
   (`hooks/useServerFrameBackground` — 촬영 1회당 2번). 색을 요청에 실어 보내는 것으로
   바꾸고 훅과 잠금을 걷어냈다.

2. **에러코드 표에 서버에 없는 항목 10개가 있었다.**
   `GEN-007/008/092/093/094`, `PAY-004/005/009/010`, `STOR-000` — 전부 제거했다.
   위 표에서 "죽은 항목"으로 잡히던 것들이다. (`NOTICE-001` 은 이 문서가 죽었다고
   적어 뒀지만 **지금은 서버에 있다** — 공지 API 가 그 뒤에 들어왔다.)

3. **`UserMediaResponse` 에 없는 필드를 읽고 있었다.**
   `displayname`(소문자)·`originalFileName` — jar 전체를 뒤져도 나오지 않는다.
   두 필드와 그 폴백 8곳을 지웠다.

4. 프록시 라우트 하나(`user-info`)만 상수 이름이 `BACKEND_BASE_URL` 이라 자동 대조에서
   샜다. 30개 전부 `BASE_URL` 로 통일했다.

5. **비밀번호 변경 다이얼로그가 상한(20자)을 몰랐다** (2026-09-02). 서버
   `ChangePasswordRequest.newPassword` 는 `minLength 8 / maxLength 20` 인데 다이얼로그는
   하한만 셌다 — 21자가 그대로 나갔고, 돌아온 `GEN-003` 의 필드 사유가 Bean Validation
   기본 **영문**이라 `apiError` 의 `HANGUL_PATTERN` 이 버려서 화면에는
   「입력값을 다시 확인해 주세요.」만 떴다. 지금은 위아래를 둘 다 잡는다
   (`PasswordChangeDialog.tsx:39-47` `validateNewPasswordLength`, 호출 :85,
   placeholder `NEW_PASSWORD_LENGTH` :148).

   ⚠️ **가입용 공용 `validatePassword()` 를 끌어오지 않았다.** 이 API 의 서버 규칙은
   `@NotBlank` + `@Size(8, 20)` 이 전부고 **`@Pattern` 이 없다** — 스웨거
   `ChangePasswordRequest` 에 `pattern` 키가 없고, 라이브로도 그렇다(아래 9 의 재현).
   공용 규칙을 쓰면 서버가 받아 주는 비밀번호를 화면이 막는다. 로그인 화면도 같은 이유로
   공용 규칙을 걷어냈다(아래 9) — 두 항목을 같이 읽어야 한다.

6. **글자를 지운 TEXT 가 프레임 저장 전체를 400 으로 만들었다** (2026-09-02).
   `ComponentRequest.source` 는 `minLength 1`(@NotBlank)이고 TEXT 의 `source` 는 글자 내용
   그 자체라, 빈 레이어 하나가 `components[0].source: must not be blank` 로 저장을 통째로
   죽였다. 지금은 `toCreateFrameRequest` 가 빈 source 컴포넌트를 요청에서 뺀다
   (`lib/frameApi.ts:179`). 지우는 것 자체는 막지 않고 — 막으면 고쳐 쓰지도 못한다 —
   사라진다는 사실을 속성 패널이 미리 말한다(`InspectorPanel.tsx:124,144-147`).

7. **업로드 크기 가드가 상한에만 있었다** (2026-09-02). 서버 `fileSize` 는 1 이상이다
   (스웨거 설명 「1 ~ 10485760」. 스키마의 `minimum: 0` 은 설명과 어긋나 있고 **실제로는
   0을 거절한다** — `파일 크기는 0보다 커야 합니다.`). 지금은
   `lib/presignedUploadApi.ts:280·:283` 이 위아래를 둘 다 막는다
   (`MIN_UPLOAD_BYTES`·`MAX_UPLOAD_BYTES`, 빈 파일 문구는 `EMPTY_UPLOAD_MESSAGE`).

8. **`generationKey` 가 프레임 내용 변경을 못 봤다 → 서버가 옛 결과를 재생했다**
   (D-4, 2026-09-02). `generationKey` 는 `remoteFrameId` 를 맨 숫자 그대로 담는데 프레임
   수정은 같은 id 로 가는 PUT 이라, 내용을 고쳐도 키가 안 변하고 서버는 같은 멱등키를 새로
   그리지 않는다. 재현:

   ```
   POST .../media/compose  {frameId:7, …, idempotencyKey:"K"}     → 202 {"jobId":1}
   PUT  /api/auth/user/frame/7   background #FFFFFF → #1ED760      → 200
   POST .../media/compose  {frameId:7, …, idempotencyKey:"K"}     → 202 {"jobId":1}  ← 수정 전 작업
   POST .../media/compose  {frameId:7, …, idempotencyKey:"K-new"} → 202 {"jobId":2}
   ```

   `FrameResponse` 에 `updatedAt`·`version` 이 없어 서버 값으로는 지문을 만들 수 없다.
   지금은 프론트가 읽어 온 내용에서 직접 만든다 — `lib/shootSessionStore.ts:74`
   `buildFrameContentKey`, 호출부는 `app/shoot/result/page.tsx:274·:356` 이
   `ensureComposeIdempotencyKey(generationKey, themeData)` 로 지문을 넘긴다.
   지문을 `generationKey` 에 **직접 넣지 않은** 이유는 프레임 내용이 네트워크로 늦게
   도착하기 때문이다 — 모르는 동안 키가 흔들리면 진행 중인 합성이 버려지고 같은 네컷이
   두 벌 접수된다(8-24 에 실제로 남았다). 그래서 지문은 두 번째 인자로 따로 받고,
   「아직 못 읽음 → 키 유지 / 처음 읽음 → 지문만 각인 / 바뀜 → 새 키 + `imageResult: null`」
   세 갈래다. 지문에 `renderUrl`·`background.url` 은 **넣지 않는다**(조회마다 다시 서명돼서
   넣으면 매번 새 키가 나온다).

   지문만으로는 구멍이 하나 남았다 — **첫 테마 조회가 실패하면 지문이 null 로 남아**, 그 뒤
   프레임을 고쳐도 「처음 알게 됐을 때」로 보고 쓰던 키를 유지한다. 그래서 **편집기 저장
   시점에도 키를 버린다**: `components/theme/editor/ThemeEditorPage.tsx` 가 `updateFrame`
   200 뒤에 `useShootSession.getState().noteRemoteFrameEdited(remoteFrameId)` 를 부르고,
   그 프레임이 지금 촬영에 쓰는 프레임이면 `composeIdempotency` 와 `imageResult` 를 함께
   버린다. **저장은 조회와 달리 실패할 수 없는 사실**이라 지문을 못 읽었어도 쓸 수 있다.

   **버리는 조건은 출력 지문이다** — 저장 직전 `buildFrameContentKey(themeJson)` 를
   불러올 때 잡아 둔 지문과 비교한다. 이름·설명만 고치거나 아무것도 안 고치고 다시
   저장해도 `updateFrame` 은 200 이라, 조건 없이 버리면 결과 화면이 같은 그림을 새
   멱등키로 다시 접수해 **보관함에 두 벌**이 남는다(8-24 의 실패와 같다).

   판정에 편집기의 이탈 경고용 지문(`buildEditorSignature`)을 쓰면 안 된다. 그쪽은
   컴포넌트를 통째로 직렬화해서 `locked` 처럼 **그림에 안 나오는 값**까지 「고쳤다」로
   보므로, 레이어를 잠그기만 해도 같은 그림이 두 벌 접수된다. 「출력을 바꾸는 값」의
   소유자는 `buildFrameContentKey` 하나다(AGENTS.md 「규칙의 소유자」).

   비교 대상은 **실제로 서버에 보낸 `themeJson`** 이다. 사용자가 저장을 누른 시점의 편집기
   상태가 아니라 `finalizeAssetsForSave()` 까지 끝난 값이라, 누르고 나서 끝난 누끼 작업처럼
   대기 중에 바뀐 것도 판정에 들어간다.

   회귀는 `ThemeEditorPage.test.tsx` 의 다섯 케이스가 지킨다 — 출력이 달라지면 버리고,
   그대로면 안 버리고, 편집기 상태만 바뀌면 안 버리고, 저장 대기 중에 끝난 변경도 잡고,
   다른 프레임이면 안 건드린다.

   ⚠️ **우리 편집기 밖에서 고친 경우는 여전히 못 본다** — 다른 기기·다른 세션에서 같은
   계정으로 프레임을 고치면 이쪽은 조회로만 알 수 있고, 그 조회가 실패하면 옛 키가 나간다.
   `FrameResponse.updatedAt` 을 받으면 이것까지 닫힌다
   (`docs/app-shell-backend-requests.md` §6).

9. **로그인 화면이 회원가입 규칙으로 로그인을 막았다** (D-5, 2026-09-02). 서버
   `LoginRequest.password` 는 `minLength 1` 뿐이다 — **상한도 문자 종류 제한도 없다.**
   그런데 `app/login/page.tsx` 가 가입용 `validatePassword`
   (`packages/shared/src/auth-validation.ts:8`)를 그대로 불러서, 그 규칙 밖 비밀번호는
   **요청이 나가지도 않았다.** 갓 만든 계정으로 끝까지 재현했다:

   ```
   PATCH /api/harucut/change/password  newPassword "abcd~1234"       → 200 GEN-000  (~ 는 정규식 밖)
   POST  /api/harucut/login            같은 비밀번호                    → 200 {"userStatus":"ACTIVE"}
   PATCH /api/harucut/change/password  newPassword "비밀번호12345678"    → 200 GEN-000  (한글도 받는다)
   PATCH /api/harucut/change/password  newPassword 21자                → 400 GEN-003 "size must be between 8 and 20"
   ```

   지금은 `app/login/page.tsx:67` 이 빈 값만 잡는다(`if (!password)`). 회귀는
   `app/login/page.test.tsx` 가 지킨다. 가입(`signup/page.tsx:84`)과
   재설정(`useForgotPasswordFlow.ts:146`)은 그대로 공용 규칙을 쓴다 — 그쪽은 *만들지 못하게*
   하는 것이라 이미 가진 비밀번호로 못 들어가는 것과 성격이 다르다.

5·6·7 은 **프론트만 고친 것이다.** 백엔드 제약은 셋 다 지금도 그대로라
(2026-09-02 `/v3/api-docs` 재확인) 가드를 걷으면 그날로 다시 400 이다.
8·9 는 방향이 반대다 — 서버가 **안 거는** 제한을 화면이 걸고 있었고(9), 서버가 **못 주는**
지문을 화면이 만들어야 했다(8). 둘 다 백엔드가 바뀌면 다시 봐야 한다
(`FrameResponse.updatedAt` 요청은 `docs/app-shell-backend-requests.md` §6).

## 아직 FE 가 안 쓰는 백엔드 기능 (2026-09-01 재도출)

⚠️ **이 목록은 문서가 들고 있으면 안 되는 종류다.** 프록시가 붙는 순간 조용히 틀려지고,
실제로 그렇게 틀려졌다 — 8-28 판은 쿠폰·구독·사진삭제를 「안 쓴다」고 적어 뒀는데
셋 다 이미 프록시가 있고 화면이 부른다:

- 쿠폰 — `apps/web/lib/couponApi.ts` → `/api/client/coupons`·`/api/client/coupons/redeem`
  → `app/mypage/page.tsx:175,635`
- 구독 — `apps/web/lib/userApi.ts:41` → `/api/client/subscriptions`
- 사진 삭제 — `app/api/client/user/media/[mediaId]/route.ts` 의 DELETE → `app/history/page.tsx:380`

**세는 방법**(`apps/web/app/api/client/**` 의 프록시 대상과 `/v3/api-docs` 를 차집합):

```bash
python3 - <<'EOF'
import importlib.util
spec = importlib.util.spec_from_file_location("chk", "scripts/check_backend_contract.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
be = m.collect_backend(m.fetch_spec("http://localhost:8080"))
fe = {(mt, m.normalize(p)) for mt, p, _ in m.collect_fe_routes()}
for mt, path in sorted(be, key=lambda x: (x[1], x[0])):
    if (mt, m.normalize(path)) not in fe:
        print(f"{mt:6} {path}")
EOF
```

오늘 이 차집합은 **26개**다. 관리자 API 19개와 웹훅 2개
(`/api/payments/webhook`, `/api/oauth2/unlink/naver`)를 빼면 **다섯 경로, 세 묶음**만 남는다:

- 결제 — `GET /api/auth/payments`, `POST /api/auth/payments/subscribe`
- 구독 해지 — `POST /api/auth/subscriptions/cancel`
- 공지 — `GET /api/notices`, `GET /api/notices/{publicId}`

레포 전체 grep(`apps`·`packages`·`scripts`, 빌드 산출물 제외)으로도 이 다섯은 호출부가
0건이다. `/api/admin` 은 3건 걸리지만 전부 주석·안내 문구이고 호출이 아니다
(`hooks/useActiveTerms.ts:23,83`, `lib/termsApi.ts:10`).

다음에 이 목록이 필요하면 **여기를 읽지 말고 위 명령을 돌린다.**

---

# ⚠️ 지금 백엔드는 **모든 등급이 무제한**이다 (2026-08-28 실측)

가격표·기록 화면의 문구와 실제 서버가 어긋난다. **프론트에서 고칠 문제가 아니라 백엔드에
확인할 문제**라 코드를 바꾸지 않고 여기 적어 둔다.

## 무엇이 다른가

| | 스웨거 설명 / 이 문서(8-20 실측) | 지금 도는 서버 |
|---|---|---|
| BASIC 프레임 보관 | 0개 (첫 프레임부터 403 `SUBS-003`) | **무제한** |
| PLUS 프레임 보관 | 3개 | **무제한** |
| PRO 프레임 보관 | 무제한 | 무제한 |
| 보관 기간 (전 등급) | 3일 / 3개월 / 무제한 | **무제한** |

## 근거 (셋 다 같은 말을 한다)

1. **사용량 API** — 갓 만든 BASIC 계정:
   ```
   GET /api/auth/user/subscription/usage
   {"planTier":"BASIC","frameRetentionLimit":-1,"frameRetentionUsedCount":0,
    "frameRetentionRemainingCount":-1,"frameRetentionUnlimited":true}
   ```
   스웨거 설명은 같은 필드를 두고 "BASIC 0 / PLUS 3 / PRO -1"이라고 적어 뒀다.

2. **실제로 저장된다** — BASIC 계정으로 프레임을 만들면 **200** 이다.
   이 문서가 8-20 에 적어 둔 `403 SUBS-003` 이 더는 재현되지 않는다.

3. **jar 안의 정책이 그렇다** — `PlanTier` enum 이 세 등급 모두
   `FrameLimit$Unlimited` + `Retention$Unlimited` 로 만들어져 있다.
   `FrameLimit$Limited`·`Retention$Days`·`Retention$Months` 클래스는 존재하지만
   **jar 안 어떤 클래스도 참조하지 않는다**(전수 검사).

## 그래서 화면이 서로 다른 말을 한다

- 가격표(정적 문구): "무료 · 커스텀 프레임 ✗", "베이직 · 3개"
- 마이페이지·프레임 화면: **무제한** — `resolveFrameCapacity` 가 정적 표보다
  서버 `usage` 를 우선하기 때문이다(그게 맞다).
- 기록 화면: "최근 3일 기록만 보여요" — 실제로는 안 잘린다.
  보관 **기간**은 API 에 필드가 없어서 프론트가 알 길이 없고 정적 표에 의존한다.

## 백엔드에 물어볼 것

질문 자체는 [`docs/app-shell-backend-requests.md`](./app-shell-backend-requests.md) §5 가
소유한다(요청은 한 곳에서만 관리한다). 요지는 **「일부러 다 열어 둔 것인지, 정책이 빠진 것인지」**이고,
답에 따라 프론트가 할 일이 갈린다.

- 의도된 것이라면 → 가격표 문구를 "결제 오픈 전까지 모두 무제한"으로 바꾼다.
- 아니라면 → 백엔드가 정책을 되살린다. 프론트는 그대로 두면 맞는다.

⚠️ **물어볼 때 `PAYMENTS_ENABLED` 를 근거로 대지 말 것.** 이 문서가 예전에
「결제가 닫혀 있어서(`PAYMENTS_ENABLED=false`)」라고 적어 뒀는데, 그것은 백엔드 설정이 아니라
**우리 쪽 상수**다(`packages/shared/src/company.ts:44`, 쓰는 곳은 `PricingView.tsx`·`MarketingFooter.tsx`).
컨테이너 환경변수에 그런 이름은 없다 — 그대로 인용하면 말이 안 통한다.

보관 **기간**은 어느 쪽이든 API 에 값이 없다. `SubscriptionUsageResponse` 는 필드가 다섯인데
전부 프레임 개수다. 화면에서 기간을 말하려면 필드가 하나 필요하다.
