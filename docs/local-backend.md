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

## ⚠️ Apple Silicon(M1~) 에서 한 줄 더 필요하다

`popeye0618/harucut` 는 **linux/amd64 만 배포된다.** arm64 맥에서 그냥 올리면 pull 자체가
실패한다:

```
no matching manifest for linux/arm64/v8 in the manifest list entries
```

`docker-compose.yml` 의 `app` 서비스에 플랫폼을 못박으면 에뮬레이션으로 돈다.

```yaml
  app:
    image: popeye0618/harucut:latest
    platform: linux/amd64      # ← 이 줄
```

mysql·redis·mailpit 은 arm64 네이티브라 그대로 두면 된다. 에뮬레이션 탓에 Spring Boot
기동이 **50초 안팎** 걸린다(네이티브는 20초대) — 느린 게 정상이다.

### Docker Desktop 없이 쓰기 (colima)

Docker Desktop 을 안 깔아도 된다. 관리자 암호도 GUI 도 필요 없다.

```bash
brew install colima docker docker-compose
colima start --cpu 4 --memory 8 --disk 60
```

두 가지 함정:
- brew 로 깐 compose 는 플러그인 경로를 따로 등록해야 `docker compose` 가 인식된다.
  `~/.docker/config.json` 에 `"cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"]`
- **재부팅하면 colima 가 자동으로 안 뜬다.** 도커 명령이 갑자기 실패하면 `colima start` 부터
  의심할 것. 자동 시작을 원하면 `brew services start colima`.

## 접속 주소

| 주소 | 용도 |
|---|---|
| http://localhost:8080 | API |
| http://localhost:8080/swagger-ui.html | API 문서 |
| http://localhost:8080/v3/api-docs | OpenAPI JSON (경로·스키마 전수 확인용) |
| http://localhost:8025 | 메일함(Mailpit). 인증 메일은 **전부 여기로만** 온다 |

## 회원가입 흐름 (로컬)

> 인증 코드는 **영문 대문자 6자**다(`FNSDRK` 같은). 숫자가 아니라서 Mailpit 본문에서
> `\d{6}` 으로 긁으면 엉뚱한 값을 집는다. 메일 본문의 `Verification Code` 다음 줄을 본다.

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
