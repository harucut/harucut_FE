# 라우트 흐름

이 문서는 주요 사용자 흐름의 라우트 계약을 정리합니다.

## 공개 진입

```text
/  -> 랜딩 페이지
   -> /home               메인 CTA
   -> /login              인증 CTA
   -> /signup             인증 CTA
```

비인증 사용자가 보호 라우트로 진입하면 미들웨어가 다음 형태로 보냅니다.

```text
/login?redirectTo=<원래 경로와 쿼리>
```

## 촬영 흐름

```text
/shoot
  -> 프레임과 선택 가능한 드래프트를 고른다
  -> shootSession에 frameId/draftId를 저장한다
  -> /shoot/capture

/shoot/capture
  -> frameId가 필요하다
  -> 8장을 촬영한다
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
  -> 이미지/비디오를 업로드한다
  -> 4개 미디어를 고른다
  -> /upload/result

/upload/result
  -> frameId가 필요하다
  -> 업로드된 미디어가 필요하다
  -> 정확히 4칸이 선택되어 있어야 한다
  -> 4개가 모두 이미지일 때만 PNG 저장 가능
  -> 1개 이상 비디오가 있을 때만 비디오 저장 가능
```

클라이언트 측 복귀 규칙:

```text
/upload/select  frameId 없음          -> /upload
/upload/result  frameId 없음          -> /upload
/upload/result  media 없음            -> /upload/select
/upload/result  4장 선택 안 됨       -> /upload/select
```

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
/history  -> 저장된 미디어 목록과 재다운로드
/mypage   -> 프로필, 비밀번호 변경, 로그아웃, 탈퇴
```

`/home`, `/history`, `/mypage`는 미들웨어 보호 대상입니다.
