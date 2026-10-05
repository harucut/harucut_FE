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
   -> /shoot              히어로 주 CTA(「가입 없이 체험하기」 → 안내 모달 → 게스트 체험 쿠키)
   -> /login              히어로 보조 CTA · 하단 CTA · 헤더 CTA(헤더 CTA 는 좁은 화면에서 숨긴다)
   -> /features           헤더 nav · 본문 「기능 자세히 보기」
   -> /enterprise         헤더 nav · 본문 「행사 도입 알아보기」
   -> /pricing            헤더 nav
   -> /faq                헤더 nav
```

랜딩에는 회원가입 링크가 없습니다 — `/signup` 으로는 `/login` 화면에서 이어집니다.

비인증 사용자가 보호 라우트로 진입하면 미들웨어가 다음 형태로 보냅니다.

```text
/login?redirectTo=<원래 경로와 쿼리>
```

게스트 체험 쿠키가 있으면 `/shoot/*`만 예외로 통과합니다. 자세한 분기는
[docs/auth-routing.md](./auth-routing.md)의 "게스트 체험 모드" 절을 참고합니다.

## 촬영 임시 보관

촬영 원본과 선택 순서·배경색·필터·합성 멱등키를 IndexedDB에 보관한다. `/shoot` 레이아웃은
복원을 마친 뒤 자식 페이지를 열어, 새로고침 직후 빈 세션으로 오인한 리다이렉트를 막는다.
원본은 컷별 Blob으로 저장하고 선택 변경 때 원본을 다시 쓰지 않는다. 결과물 blob URL은
문서 수명에 묶이므로 보관하지 않고 원본에서 다시 만든다. 서버 합성 전에는 멱등키 쓰기를 기다린다.

- 마지막 변경부터 24시간. 만료되거나 손상된 보관물은 사진까지 지운다.
- `/shoot` 재진입 시 기존 사진이 있으면 이어 만들기·새로 시작하기를 제공한다. 새로 시작은 삭제 확인 후 실행한다.
- 앱 전환·카메라 트랙 중단 시 자동 촬영을 멈춘다. 이미 찍은 컷은 유지하며 남은 컷부터 이어 찍는다.
- 명시적 로그아웃·탈퇴 시 촬영 세션, 편집 초안, 게스트 저장 인계를 정리한다.
- 저장소 차단·용량 부족은 화면에 알린다. 브라우저 데이터 삭제, 쓰기가 끝나기 전 강제 종료까지 복구를 보장하지 않는다.
- 복원은 현재 기기에서만 된다. 다른 기기와 동기화하거나 게스트 사진을 자동으로 서버에 올리지 않는다.

소유자: `shootSessionStorage.ts`, `shootSessionPersistence.ts`, `ShootSessionBoundary.tsx`.
단위 테스트로 왕복·만료·실패·로그아웃 경합을 검증했으며, 실제 브라우저 재시작 시험은 별도 QA 항목이다.

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
  -> 원본 4장을 올려 서버가 합성하고, 결과를 기록에 남긴다
  -> 결과를 다운로드하거나 링크로 공유한다
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
