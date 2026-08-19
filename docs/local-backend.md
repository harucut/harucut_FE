# 로컬 백엔드 실행 (프론트 개발용)

2026-08-20 기준. 백엔드가 Kotlin → Java 로 재구현되면서 로컬 실행 방식이 **통째로 바뀌었다.**

| | 예전 | 지금 |
|---|---|---|
| 위치 | `harucut_BE/local-docker/compose.yml` | 백엔드가 카톡으로 준 zip (레포 밖 아무 폴더) |
| 이미지 | `popeye0618/harucut-be` | **`popeye0618/harucut`** (다른 저장소다) |
| DB | 앱 컨테이너 안 H2 파일DB | **MySQL 8.0** 별도 컨테이너 (3306) |
| 메일 | MailHog | **Mailpit** (1025 SMTP / 8025 웹UI) |
| 그 외 | redis | redis + **compose 프로젝트명 `harucut-local`** |

예전 스택은 더 이상 쓰지 않는다. 두 스택 모두 8080 을 쓰므로 **동시에 뜰 수 없다.**

## 준비

zip 안의 `docker-compose.yml` · `.env` · `README.md` 를 같은 폴더에 둔다.
이 레포 밖에 두는 걸 권한다 — `.env` 에 실제 AWS·소셜 자격증명이 들어 있다.
(레포 안에 두더라도 루트 `.gitignore` 의 `.env` / `.env.*` 규칙이 잡아 준다.)

```bash
docker compose up -d
```

## ⚠️ `.env` 에서 **반드시** 고쳐야 하는 것

```diff
- FRONTEND_URL=http://localhost:5173
+ FRONTEND_URL=http://localhost:3000
```

`5173` 은 Vite 기본 포트다. 우리 웹은 `next dev` = **3000** 이다.
안 고치면 소셜 로그인 성공 후 5173 으로 튕겨서 로그인이 끝나지 않는다.
고친 뒤 `docker compose up -d` 를 다시 돌려야 반영된다.

고치고 나면 로그인 응답에 `Access-Control-Allow-Origin: http://localhost:3000` 이 실려 온다.

## 접속 주소

| 주소 | 용도 |
|---|---|
| http://localhost:8080 | API |
| http://localhost:8080/swagger-ui.html | API 문서 |
| http://localhost:8080/v3/api-docs | OpenAPI JSON (경로·스키마 전수 확인용) |
| http://localhost:8025 | 메일함(Mailpit). 인증 메일은 **전부 여기로만** 온다 |

## 회원가입 흐름 (로컬)

메일이 실제로 안 나가므로 코드를 Mailpit 에서 꺼내야 한다.

1. `POST /api/email-auth/code` `{"email":"..."}`
2. http://localhost:8025 에서 메일 열어 **6자리 대문자+숫자** 코드 확인
3. `POST /api/email-auth/verification` `{"email":"...","code":"..."}`
4. `POST /api/harucut/register` `{"email":"...","username":"...","password":"8자 이상"}`
5. `POST /api/harucut/login` → `accessToken` / `refreshToken` 쿠키가 내려온다

2번을 건너뛰고 4번을 부르면 `400 AUTH-004`.
1번을 연달아 부르면 `429 AUTH-040`(쿨다운) — 실제로 잘 걸린다.

## 겪은 문제와 해결

**`Bind for 0.0.0.0:8080 failed: port is already allocated`**

예전 스택이 `restart: unless-stopped` 로 살아 있는 것이다. 예전 폴더에서 끄면 된다
(볼륨은 남으므로 되돌릴 수 있다):

```bash
cd <예전>/harucut_BE/local-docker && docker compose down
```

**앱이 계속 재시작하고 로그에 `UnknownHostException: mysql`**

위 포트 충돌로 컨테이너가 **반쯤 만들어진 상태**로 남아서 네트워크에 안 붙은 것이다.
재시작으로는 안 고쳐진다. 지우고 다시 만들어야 한다:

```bash
docker compose down && docker compose up -d
```

**뜬 것 같은데 응답이 없다**

컨테이너가 `Up` 이어도 Spring 기동에 20~30초 더 걸린다. 이걸로 확인:

```bash
docker logs harucut-app 2>&1 | grep "Started HarucutApplication"
```

## 쿠키

로컬에서 백엔드가 내려주는 형식(실측):

```
accessToken=<jwt>;  Path=/; Domain=localhost; Max-Age=1800;    Expires=...; HttpOnly; SameSite=Lax
refreshToken=<jwt>; Path=/; Domain=localhost; Max-Age=1209600; Expires=...; HttpOnly; SameSite=Lax
```

`Secure` 가 없고 `SameSite=Lax` 라 http localhost 에서 그대로 저장된다.
`lib/server/setCookies.ts` 의 http 보정(Secure 제거 / SameSite=None→Lax)은 이 조합에서는
할 일이 없어 no-op 이고, `Domain=localhost` 도 호스트와 같아 제거되지 않는다.

## 유지보수

```bash
docker compose pull app && docker compose up -d   # 백엔드 최신으로
docker compose down                               # 끄기 (데이터 유지)
docker compose down -v                            # DB 까지 초기화
```

백엔드가 자주 갱신되므로, 계약이 이상하면 **먼저 `pull` 하고 `/v3/api-docs` 를 다시 본다.**
백엔드가 준 변경점 문서는 실제 이미지보다 며칠 뒤처져 있던 전례가 있다
(`docs/backend-contract.md` 참조).
