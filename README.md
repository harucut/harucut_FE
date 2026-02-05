# harucut 프론트엔드

하루의 순간을 기록하고 네컷 프레임으로 완성하는 웹 앱입니다. 촬영/업로드/테마 꾸미기 흐름을 제공하며, 결과물을 이미지(PNG) 또는 영상(WEBM)으로 다운로드할 수 있습니다.

## 기술 스택
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Zustand (클라이언트 상태 관리)
- Konva / react-konva (캔버스 편집)
- Axios (API 통신)

## 주요 기능
- 촬영 플로우: 웹캠 자동 촬영(8장) + 4장 선택 + 프레임 합성
- 업로드 플로우: 사진/영상 업로드 + 4장 선택 + 프레임 합성
- 테마 에디터: 프레임 위에 사진/스티커/텍스트를 배치하여 커스텀 테마 제작
- 인증/계정: 이메일 로그인/회원가입/비밀번호 재설정/소셜 로그인
- 마이페이지: 사용자 정보 조회, 닉네임/비밀번호 변경, 로그아웃/탈퇴

## 사용자 플로우
- 촬영
1. `/shoot`에서 프레임 선택
2. `/shoot/capture`에서 자동 촬영(8장)
3. `/shoot/select`에서 4장 선택
4. `/shoot/result`에서 PNG/WEBM 다운로드

- 업로드
1. `/upload`에서 프레임 선택
2. `/upload/select`에서 파일 업로드 + 4장 선택
3. `/upload/result`에서 PNG/WEBM 다운로드

- 테마 꾸미기
1. `/theme`에서 프레임 선택
2. `/theme/sticker`에서 에디터로 꾸미기
3. 저장 시 Draft로 보관 및 서버 저장

## 라우팅 요약 (App Router)
- `/` 랜딩
- `/home` 기능 선택
- `/shoot/*` 촬영 플로우
- `/upload/*` 업로드 플로우
- `/theme/*` 테마 꾸미기 플로우
- `/login`, `/signup`, `/forgot-password` 인증
- `/mypage` 계정 관리
- `/history` (준비 중)

## 상태 관리 (Zustand)
- `lib/shootSessionStore.ts`: 촬영 세션(프레임/샷/선택) 상태
- `lib/uploadSessionStore.ts`: 업로드 세션(프레임/미디어/선택) 상태
- `lib/themeEditorStore.ts`: 테마 에디터(자산, 컴포넌트, 레이어) 상태
- `lib/themeDraftStore.ts`: 테마 Draft 로컬 보관 (persist)
- `lib/themeSessionStore.ts`: 테마 플로우의 선택값 보관

## 캔버스/합성 파이프라인
- `lib/canvas/loaders.ts`: 이미지/비디오 로더
- `lib/canvas/draw.ts`: cover 방식으로 슬롯에 맞춰 그리기
- `lib/canvas/composeFrame.ts`: 슬롯 합성 + PNG/WEBM 생성

## API 연동/인증
- `lib/api.ts`: Axios 인스턴스 (BASE URL, 쿠키 포함)
- `lib/auth/*`: 로그인/회원가입/비밀번호 재설정 API
- `app/api/client/*`: 프론트 서버에서 쿠키 기반 호출을 백엔드로 프록시
- `proxy.ts`: 인증 보호/리이슈 로직을 위한 미들웨어 헬퍼

## 환경 변수
- `NEXT_PUBLIC_BASE_URL`: 백엔드 API Base URL
- `JWT_ACCESS_SECRET`: 엣지 런타임에서 accessToken 검증용 시크릿

## 스크립트
- `pnpm dev`: 개발 서버
- `pnpm build`: 스티커 리스트 생성 후 빌드
- `pnpm generate:stickers`: `public/stickers` → `constants/stickers.generated.ts` 생성

## 디렉터리 구조 (핵심)
- `app/`: 라우트 페이지 및 API 라우트
- `components/`: UI 컴포넌트
- `lib/`: 상태 관리/유틸/캔버스/인증 로직
- `constants/`: 프레임/색상/스티커 목록
- `public/`: 스티커 이미지, 사운드 등 정적 리소스

## 개발 메모
- 촬영/업로드 결과 생성은 클라이언트 캔버스에서 수행됩니다.
- 테마 에디터는 Konva로 구현되어 레이어/텍스트/이미지 조작이 가능합니다.
