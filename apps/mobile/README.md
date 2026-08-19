# Harucut Mobile

Harucut 모바일 앱의 기본 골격입니다.

## 목표

- 웹 서비스를 크게 건드리지 않고 iOS/Android 앱 개발을 시작한다.
- 촬영, 히스토리, 마이페이지 중심의 모바일 정보 구조를 먼저 맞춘다.
- 인증 저장소, 카메라, 이미지 선택, API 연결 포인트를 준비한다.

## 실행

```bash
pnpm dev:mobile
```

또는 `apps/mobile`에서 직접:

```bash
pnpm start
```

## 환경 변수

`.env.example`을 참고해 `EXPO_PUBLIC_API_BASE_URL`을 설정합니다.
