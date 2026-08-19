# Harucut Mobile Blueprint

## 목표

- 웹 서비스를 유지한 채 `apps/mobile`에서 iOS/Android 앱을 개발한다.
- 모바일은 촬영, 결과 확인, 히스토리, 마이페이지를 빠르게 진입할 수 있는 구조를 우선한다.
- 고난도 편집기 로직은 웹에서 바로 복제하지 않고, 모바일에 맞는 단계형 경험으로 다시 설계한다.

## 왜 별도 앱인가

- 현재 웹은 `react-konva`, `HTMLCanvasElement`, `getUserMedia` 같은 브라우저 전용 API에 깊게 의존한다.
- 모바일 앱은 Expo + React Native 기준으로 화면과 입력을 다시 설계해야 한다.
- 따라서 UI는 별도 구현, 인증/세션/API 계약/도메인 문서만 점진적으로 공유하는 방향이 맞다.

## 현재 구조

- `apps/web`: 기존 Next.js App Router 웹 앱
- `apps/mobile`: Expo Router 기반 모바일 앱
- `packages/shared`: 웹·앱이 실제로 함께 쓰는 공용 모듈 `@harucut/shared`
  - `auth-validation.ts`: 이메일/비밀번호 검증 규칙
  - `fourcut-filters.ts`: 네컷 필터 정의
  - `legal.ts`: 약관·개인정보처리방침 본문
- 아직 공유하지 않는 것: API 타입, 프레임 레이아웃 상수(웹 `constants/frameLayouts.ts` ↔ 앱 `components/harucut/frame.tsx`에 같은 규격으로 이중 정의)

## 1차 범위

- 홈
- 촬영 진입
- 히스토리
- 마이페이지
- 테마 편집 진입 경로
- API base URL 및 인증 저장소 포인트

## 2차 범위

- 실제 촬영 가이드
- 결과 다운로드/공유
- 히스토리 상세

## 3차 범위

- 모바일 편집기 — **출시 완료** (`app/(app)/theme/sticker.tsx` 테마 에디터)
- 배경 제거 — **MVP 완료** (`cellCutouts` 기반 칸 단위 시각 효과, ADR-0002 참고)
- 고급 렌더링 — 진행 예정

동영상 합성은 2026-06-28 `b916432`로 폐기했다. 서비스는 사진 전용이다.

남은 범위는 성능, 비용, 품질 기준을 보고 서버 처리 또는 별도 렌더링 전략으로 나눠 판단한다.

