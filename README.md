# Harucut Frontend

Harucut은 네 컷 사진을 위한 서비스입니다.
사용자는 다음 기능을 사용할 수 있습니다.

- 8장을 촬영한 뒤 4장을 선택해 결과물을 만든다
- 로컬 이미지나 비디오를 업로드해 프레임을 합성한다
- 커스텀 프레임 테마를 만들고 수정한다
- 합성 결과를 PNG 또는 비디오로 다운로드한다
- 저장된 미디어와 계정 정보를 관리한다

## 기술 스택

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Zustand
- Konva / react-konva
- Jest
- Playwright
- Storybook

## 시작하기

1. 의존성을 설치합니다.

```bash
pnpm install
```

2. 환경 변수를 설정합니다.

```bash
NEXT_PUBLIC_BASE_URL=<백엔드 기본 URL>
```

3. 개발 서버를 실행합니다.

```bash
pnpm dev
```

## 스크립트

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm lint`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm test:e2e`
- `pnpm storybook`
- `pnpm build-storybook`
- `pnpm generate:stickers`

## 라우트 개요

공개 라우트:

- `/`
- `/login`
- `/signup`
- `/forgot-password`

보호 라우트:

- `/home`
- `/shoot/*`
- `/upload/*`
- `/theme/*`
- `/history`
- `/mypage`

보호 라우트는 [`proxy.ts`](./proxy.ts)에서 처리합니다.
비인증 상태에서 접근하면 `/login?redirectTo=<원래 경로>`로 이동합니다.

## 핵심 흐름

```text
촬영
/shoot -> /shoot/capture -> /shoot/select -> /shoot/result

업로드
/upload -> /upload/select -> /upload/result

테마
/theme -> /theme/sticker -> /theme
```

각 멀티스텝 흐름은 메모리 기반 Zustand 세션 상태에 의존합니다.
필요한 상태 없이 뒤 단계로 직접 진입하면 가장 이른 유효 단계로 되돌아갑니다.

## 주요 디렉터리

- `app/`: App Router 페이지와 라우트 핸들러
- `components/`: 공용 UI 컴포넌트
- `lib/`: API 클라이언트, 인증 헬퍼, 상태 저장소, 캔버스 로직
- `constants/`: 프레임, 색상, 스티커 메타데이터
- `scripts/`: 빌드 보조 스크립트
- `tests/`: Playwright E2E 테스트

## 문서

- 라우트 다이어그램: [`docs/route-flows.md`](./docs/route-flows.md)
- 인증 및 리다이렉트 규칙: [`docs/auth-routing.md`](./docs/auth-routing.md)
- 작업 메모와 규칙: [`AGENTS.md`](./AGENTS.md)

## 테스트 메모

- 유틸리티와 순수 로직은 Jest로 검증합니다.
- 현재 E2E는 공개 라우팅과 보호 라우트 리다이렉트 동작에 초점을 맞춥니다.
- 보호된 전체 사용자 흐름을 끝까지 검증하려면 인증된 테스트 컨텍스트가 필요합니다.
