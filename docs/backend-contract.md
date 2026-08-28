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
| **사용자가 고른 테두리색** | `ComposeRequest` 에 배경/색 자리가 없다(실측 재확인 2026-08-21: `frameId`·`sourceKeys`·`idempotencyKey` 셋뿐). 배경은 **프레임에 저장된 값**만 쓴다. 색은 자유 입력(`<input type="color">`)이라 프레임을 미리 만들어 둘 수도 없고, BASIC 은 프레임 저장 한도가 0이라 즉석 생성도 막힌다 |
| ~~꾸미기(스티커·드로잉) 저장~~ | **해당 없음** — 이 제약 때문에 `/decorate` 기능 자체를 제거했다(2026-08). 프레임 꾸미기(`/theme/*`)는 그대로 남는다 |
| ~~비회원 결과를 로그인 후 기록으로~~ | **해결됨** — 완성본 대신 **원본 4장을 보관**했다가 로그인 후 합성한다(`lib/pendingGuestSave.ts`). 백엔드 수단 불필요 |
| ~~TEXT 가 든 프레임~~ | **해결됨(2026-08-21)** — 저장할 때 글자 층을 투명 PNG 로 구워 `renderedKey` 로 함께 보낸다(`lib/canvas/textLayer.ts`) |
| ~~정적 경로 스티커~~ | **해결됨(2026-08-21)** — 저장 직전에 S3 로 올려 `source` 를 key 로 바꾼다(`themeEditorStore.finalizeAssetsForSave`) |

**백엔드에 남은 요청은 테두리색 하나다.**

### 테두리색을 그때까지 어떻게 다루나

미리보기가 사용자가 고른 색을 보여 주고 저장본은 프레임 배경으로 나오면, 사용자는
**자기가 본 적 없는 그림**을 받는다. 색을 한 번도 안 건드려도 어긋난다 — 우리 기본값
(`#23262d`)과 서버에 등록된 시스템 프레임 배경을 맞춰 주는 코드가 없었기 때문이다.

그래서 회원 경로에서는 **서버가 쓸 배경을 읽어 미리보기에 반영하고**
(`hooks/useServerFrameBackground.ts`) 색 선택을 잠근다. 비회원은 결과물을 브라우저가
그려 내려받으므로 고른 색이 실제로 적용된다 — 잠그지 않는다.
`ComposeRequest.background` 가 생기면 이 훅과 잠금을 걷어내면 된다.

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

# 계약 재대조 (2026-08-28)

이번에는 **손으로 읽지 않고 기계로 맞췄다.** 같은 대조를 다시 하려면:

```bash
pnpm check:contract            # 요약
pnpm check:contract -- --show-required   # 필수 요청 필드까지
```

`scripts/check_backend_contract.py` 가 도는 백엔드의 `/v3/api-docs` 를 읽고,
에러코드는 **컨테이너 안 jar 의 ErrorCode enum** 에서 직접 뽑아 비교한다.
스웨거 응답 예시만 보면 문서화되지 않은 코드(`GEN-091` 같은 5xx)를 죽은 항목으로
잘못 짚기 때문이다 — 실제로 스웨거 기준 45개 vs jar 기준 52개로 갈렸다.

## 이번 대조 결과

| 항목 | 결과 |
|---|---|
| FE 프록시 33개 핸들러 → 백엔드 경로 | **33/33 존재** |
| 호출되지 않는 프록시 라우트 | **없음** |
| 에러코드 (jar 52개) ↔ FE 문구표 | **누락 0** |
| FE 필수 요청 필드 | 15개 엔드포인트 전부 충족 |

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

## 아직 FE 가 안 쓰는 백엔드 기능

프록시가 없을 뿐 백엔드에는 있다. 필요해지면 붙이면 된다.

- 구독/결제 — `GET /api/auth/subscriptions`, `POST /api/auth/payments/subscribe`,
  `POST /api/auth/subscriptions/cancel`, `GET /api/auth/payments`
- 쿠폰 — `GET /api/auth/coupons`, `POST /api/auth/coupons/redeem`
- 공지 — `GET /api/notices`, `GET /api/notices/{publicId}`
- 사진 삭제 — `DELETE /api/auth/user/media/{mediaId}`
- 관리자 API 전체(`/api/admin/*`), 웹훅(`/api/payments/webhook`, `/api/oauth2/unlink/naver`)

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

결제가 닫혀 있어서(`PAYMENTS_ENABLED=false`) **일부러 다 열어 둔 것인지**, 아니면 정책이
빠진 것인지. 답에 따라 프론트가 할 일이 갈린다.

- 의도된 것이라면 → 가격표 문구를 "결제 오픈 전까지 모두 무제한"으로 바꾼다.
- 아니라면 → 백엔드가 정책을 되살린다. 프론트는 그대로 두면 맞는다.

보관 **기간**은 어느 쪽이든 API 에 값이 없다. 화면에서 기간을 말하려면
`SubscriptionUsageResponse` 에 필드가 하나 필요하다(프레임 개수처럼).
