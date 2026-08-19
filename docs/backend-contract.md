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
| `ComposeRequest` | — | `frameId`·`sourceKeys[]`·`idempotencyKey` **모두 필수** |
| `PresignedUploadRequest.type` | — | `PROFILE\|FRAME\|FRAME_COMPONENT\|FOURCUT_SOURCE` |
| `POST /api/auth/user/media` | 있다고 가정 | **없다 → 405 `GEN-041`** |

옛 업로드 타입 `FOURCUT_PHOTO` 는 **400 `GEN-006`** 으로 거부된다. 개명은 이미 끝났다.

BASIC 계정 실측:
- `GET /api/auth/user/subscription/usage` → `{"planTier":"BASIC","frameRetentionLimit":0,"frameRetentionUsedCount":0,"frameRetentionRemainingCount":0,"frameRetentionUnlimited":false}`
- `GET /api/auth/subscriptions` → `{"planTier":"BASIC","status":"ACTIVE","autoRenew":false}`
- 프레임 저장 시도 → **403 `SUBS-003`** (한도가 0이라 첫 프레임부터 막힌다)

BASIC 은 한도가 0이라 **"프레임 저장 후 목록 500"(`PRODUCT.md`) 는 이 계정으로 재현할 수 없다.**
유료 플랜 계정이 생기면 다시 확인해야 한다 — 아직 해소됐다고 볼 근거가 없다.


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
(`lib/fourcutCompose.ts`의 `resolveComposeFrameId`). 같은 종류가 여럿이면 **가장 먼저 등록된 것**을 쓴다 —
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
| **사용자가 고른 테두리색** | `ComposeRequest` 에 배경/색 자리가 없다. 배경은 **프레임에 저장된 값**만 쓴다. 색은 자유 입력(`<input type="color">`)이라 프레임을 미리 만들어 둘 수도 없고, BASIC 은 프레임 저장 한도가 0이라 즉석 생성도 막힌다 |
| ~~꾸미기(스티커·드로잉) 저장~~ | **해당 없음** — 이 제약 때문에 `/decorate` 기능 자체를 제거했다(2026-08). 프레임 꾸미기(`/theme/*`)는 그대로 남는다 |
| ~~비회원 결과를 로그인 후 기록으로~~ | **해결됨** — 완성본 대신 **원본 4장을 보관**했다가 로그인 후 합성한다(`lib/pendingGuestSave.ts`). 백엔드 수단 불필요 |
| **TEXT 가 든 프레임** | compose 400 `GEN-002` — TEXT 는 글자층을 구운 `renderedKey` 를 프레임 저장 때 함께 보내야 한다. 지금은 안 보낸다 |
| **정적 경로 스티커** | 같은 `GEN-002` — `/stickers/x.png` 처럼 S3 밖 자산을 쓰는 프레임은 거부된다 |

**백엔드에 남은 요청은 테두리색 하나다.** TEXT·스티커는 프레임 저장 쪽 우리 작업이다.

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
