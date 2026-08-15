# 라우트 흐름

이 문서는 주요 사용자 흐름의 라우트 계약을 정리합니다.

## 공개 진입

로그인 없이 열리는 라우트(미들웨어 보호 대상 아님):

```text
/                  랜딩
/login             로그인
/signup            회원가입
/forgot-password   비밀번호 재설정
/features          기능 소개
/faq               자주 묻는 질문
/pricing           요금제
/privacy           개인정보처리방침
/terms             이용약관
/oauth2/callback   소셜 로그인 콜백
```

랜딩에서 이어지는 진입 경로:

```text
/  -> 랜딩 페이지
   -> /home               메인 CTA
   -> /login              인증 CTA
   -> /signup             인증 CTA
   -> /features           기능 소개
   -> /pricing            요금제
```

비인증 사용자가 보호 라우트로 진입하면 미들웨어가 다음 형태로 보냅니다.

```text
/login?redirectTo=<원래 경로와 쿼리>
```

게스트 체험 쿠키가 있으면 `/shoot/*`와 `/decorate/*`만 예외로 통과합니다. 자세한 분기는
[docs/auth-routing.md](./auth-routing.md)의 "게스트 체험 모드" 절을 참고합니다.

## 촬영 흐름

```text
/shoot
  -> 프레임과 선택 가능한 드래프트를 고른다
  -> shootSession에 frameId/draftId를 저장한다
  -> /shoot/capture

/shoot/capture
  -> frameId가 필요하다
  -> 프레임 없이 슬롯 비율만 반영해 8장을 촬영한다
  -> /shoot/select

/shoot/select
  -> frameId가 필요하다
  -> 촬영 결과가 필요하다
  -> 4장을 선택한다
  -> /shoot/result

/shoot/result
  -> frameId가 필요하다
  -> 촬영 결과가 필요하다
  -> 정확히 4칸이 선택되어 있어야 한다
  -> 결과를 다운로드하거나 업로드한다
  -> "꾸미기"를 누르면 /decorate
```

클라이언트 측 복귀 규칙:

```text
/shoot/capture  frameId 없음          -> /shoot
/shoot/select   frameId 없음          -> /shoot
/shoot/select   shots 없음            -> /shoot/capture
/shoot/result   frameId 없음          -> /shoot
/shoot/result   shots 없음            -> /shoot/select
/shoot/result   4장 선택 안 됨       -> /shoot/select
```

## 업로드 흐름

```text
/upload
  -> 프레임과 선택 가능한 드래프트를 고른다
  -> uploadSession에 frameId/draftId를 저장한다
  -> /upload/select

/upload/select
  -> frameId가 필요하다
  -> 이미지를 업로드한다
  -> 4장을 고른다
  -> /upload/result

/upload/result
  -> frameId가 필요하다
  -> 업로드된 이미지가 필요하다
  -> 정확히 4칸이 선택되어 있어야 한다
  -> 4칸이 모두 채워졌을 때 PNG로 저장한다
  -> "꾸미기"를 누르면 /decorate
```

클라이언트 측 복귀 규칙:

```text
/upload/select  frameId 없음          -> /upload
/upload/result  frameId 없음          -> /upload
/upload/result  업로드 이미지 없음    -> /upload/select
/upload/result  4장 선택 안 됨       -> /upload/select
```

## 꾸미기 흐름

`/decorate`는 촬영·업로드 결과의 마지막 단계입니다. 두 result 페이지가 합성된
네컷 PNG를 세션에 담고 `/decorate`로 보냅니다.

```text
/shoot/result  -> setDecorateSource(합성 이미지) -> /decorate
/upload/result -> setDecorateSource(합성 이미지) -> /decorate

/decorate
  -> 세션에 꾸미기 원본 이미지가 필요하다
  -> 펜으로 그리기 / 텍스트 추가 / 스티커 배치
  -> 이미지 다운로드
  -> 기록에 저장 (회원)
  -> 로그인하고 저장 (게스트: 결과를 보관하고 /login으로,
     인증 후 /home의 GuestTrialBridge가 자동 업로드)
```

- 관련 파일: `apps/web/app/decorate/page.tsx`, `components/decorate/*`,
  `lib/decorateSessionStore.ts`, `lib/decorateStore.ts`, `lib/decorateCompose.ts`
- 캔버스는 `react-konva` 기반이라 SSR을 끄고 동적 로드합니다.
- `/decorate`는 보호 라우트입니다(`lib/protectedPaths.ts`). 다만 게스트 체험은
  `proxy.ts`의 `GUEST_ALLOWED_PREFIXES`(`/shoot`, `/decorate`)로 통과시켜
  촬영부터 꾸미기까지 이어집니다. 저장 시점에만 로그인으로 유도합니다.

## 테마 흐름

```text
/theme
  -> 프레임 타입을 고른다
  -> 저장된 원격 프레임을 불러올 수 있다
  -> /theme/sticker

/theme/sticker
  -> themeSession의 frameId가 필요하다
  -> ThemeEditorPage를 연다
  -> 저장 또는 삭제 후 /theme로 돌아간다
```

클라이언트 측 복귀 규칙:

```text
/theme/sticker  frameId 없음          -> /theme
```

## 홈, 기록, 마이페이지

```text
/home     -> 기능 허브
/history  -> 저장된 사진 목록과 재다운로드
/mypage   -> 프로필, 비밀번호 변경, 로그아웃, 탈퇴
```

`/home`, `/history`, `/mypage`는 미들웨어 보호 대상입니다.
