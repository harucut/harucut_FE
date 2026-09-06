# Harucut Mobile

웹을 그대로 띄우는 **WebView 셸**이다. 자기 화면을 그리지 않는다(ADR-0003).
소스는 다섯 파일, 라우트는 하나다.

| 파일 | 하는 일 |
|---|---|
| `app/_layout.tsx` | 안전영역 provider 와 헤더 없는 Stack |
| `app/index.tsx` | 유일한 라우트 — 셸을 띄운다 |
| `components/harucut-web-shell.tsx` | WebView, 안전영역, 상태바 색, 하드웨어 뒤로가기, 외부 링크 |
| `lib/native-bridge.ts` | 웹이 보내는 요청 처리(사진첩 저장·공유·햅틱·알림) |
| `constants/shell.ts` | 웹/백엔드 오리진, 셸 UA 토큰, OAuth 판정 |

네이티브가 맡는 일곱 가지와 그 이유는 [`docs/mobile-shell.md`](../../docs/mobile-shell.md) 에 있다.
**"모바일 화면을 고쳐라"의 정답은 거의 항상 `apps/web`** 이다.

## 실행

```bash
pnpm dev:mobile          # expo start
pnpm android-dev:mobile  # expo run:android (개발 빌드)
```

브리지를 건드리면 `apps/web/lib/nativeBridge.ts` 와 **같은 커밋에서** 고친다 — 한 쌍이다.

## 환경 변수

`.env.example` 을 복사해 `EXPO_PUBLIC_WEB_ORIGIN` 을 설정한다(앱이 띄울 웹 주소).
비워 두면 `app.json` 의 `extra.webOrigin` 이 쓰인다. 백엔드 주소는 `EXPO_PUBLIC_API_ORIGIN`
이고, 마찬가지로 비우면 `extra.apiOrigin` 이 쓰인다.

안드로이드 에뮬레이터에서 호스트의 localhost 는 `10.0.2.2` 다.
