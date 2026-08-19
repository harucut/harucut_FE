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
