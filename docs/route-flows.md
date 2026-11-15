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
   -> /create              히어로 주 CTA(「가입 없이 체험하기」 → 안내 모달 → 게스트 체험 쿠키)
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

게스트 체험 쿠키가 있으면 `/create/*`만 예외로 통과합니다. 자세한 분기는
[docs/auth-routing.md](./auth-routing.md)의 "게스트 체험 모드" 절을 참고합니다.

## 촬영 임시 보관

**회원만 남긴다.** 비회원이 찍던 사진은 이 기기에 쓰지 않고, 예전에 남은 것은 읽지 않고 지운다(2026-11-15
「비회원 촬영하던 사진 관리 안 해도 될 거 같아. 지워버려」). 비회원 사진은 그 탭의 메모리에만 있어, 새로고침하거나
다시 들어오면 새 촬영이다 — 완성 화면에서 저장하거나 「로그인하고 보관하기」(`pendingGuestSave`, 별도 보관소)로 옮긴다.

촬영 원본과 선택 순서·필터·사진 이름·합성 멱등키를 IndexedDB에 보관한다. `/create` 레이아웃은
복원을 마친 뒤 자식 페이지를 열어, 새로고침 직후 빈 세션으로 오인한 리다이렉트를 막는다.
원본은 컷별 Blob으로 저장하고 선택 변경 때 원본을 다시 쓰지 않는다. 결과물 blob URL은
문서 수명에 묶이므로 보관하지 않고 원본에서 다시 만든다. 서버 합성 전에는 멱등키 쓰기를 기다린다.

- 마지막 변경부터 24시간. 만료되거나 손상된 보관물은 사진까지 지운다.
- 회원이 `/create` 에 다시 오면 「촬영하던 사진이 있어요」로 이어 만들기·새로 시작하기를 제공한다. 새로 시작은 삭제 확인 후 실행한다.
  비회원에게는 이 화면이 없다(완성 사진을 다시 보던 「완성한 사진이 있어요」도 함께 걷었다).
- 앱 전환·카메라 트랙 중단 시 자동 촬영을 멈춘다. 이미 찍은 컷은 유지하며 남은 컷부터 이어 찍는다.
- 명시적 로그아웃·탈퇴 시 촬영 세션, 편집 초안, 게스트 저장 인계를 정리한다.
- 저장소 차단·용량 부족은 화면에 알린다. 브라우저 데이터 삭제, 쓰기가 끝나기 전 강제 종료까지 복구를 보장하지 않는다.
- 복원은 현재 기기에서만 된다. 다른 기기와 동기화하지 않는다.

소유자: `shootSessionStorage.ts`, `shootSessionPersistence.ts`, `ShootSessionBoundary.tsx`.
단위 테스트로 왕복·만료·실패·로그아웃 경합을 검증했으며, 실제 브라우저 재시작 시험은 별도 QA 항목이다.

## 만들기 흐름

주소는 2026-11-15 `/shoot`(촬영)에서 `/create`(만들기)로 옮겼다 — 찍든 갤러리에서 불러오든 같은 흐름이다.
예전 `/shoot/*` 주소는 `next.config.ts` 의 redirects 가 `/create/*` 로 넘긴다(`/shoot/upload` 는 `/create?source=upload`).

```text
/create
  -> 프레임과 선택 가능한 드래프트를 고른다
  -> shootSession에 frameId/draftId를 저장한다
  -> /create/capture          (사진 찍기)
  -> /create/select           (?source=upload — 갤러리에서 불러오기. 회원만, 「사진 고르러 가기」에서 확인)

/create/capture
  -> frameId가 필요하다
  -> 프레임 없이 슬롯 비율만 반영해 8장을 촬영한다(프리뷰 사각형 = 저장되는 사각형)
  -> 프리뷰는 남는 칸의 가운데다. 가로로 긴 화면(폰을 옆으로 든 때·PC)에서는 프리뷰가 왼쪽, 장수·셔터·간격이 오른쪽 줄
     — 앱(WebView)은 세로로 잠겨 있어 브라우저에서만 돈다(apps/mobile/app.json 의 orientation)
  -> 카운트다운은 프리뷰 정중앙에 작고 옅게 뜬다. 간격 칩(3·5·8초)은 찍는 동안에도 바꿀 수 있다(다음 컷부터)
  -> /create/select

/create/select
  -> frameId가 필요하다
  -> 촬영 결과가 필요하다(불러오기는 없어도 된다 — 목록 맨 앞 「사진 불러오기」 칸으로 불러온다. 불러온 사진은
     목록에 올라갈 뿐이고 칸에는 눌러서 넣는다)
  -> 4장을 선택하고 꾸민다(보정·사진 이름. 테두리 색은 고르지 않는다 — 고른 프레임 카드의 색 그대로다)
  -> /create/result

/create/result
  -> frameId가 필요하다
  -> 촬영 결과가 필요하다
  -> 정확히 4칸이 선택되어 있어야 한다
  -> 원본 4장을 올려 서버가 합성하고, 결과를 기록에 남긴다
  -> 결과를 다운로드하거나 링크로 공유한다. 저장하면 「사진을 저장했어요」(앱은 「사진첩에 저장했어요」)가 뜨고
     주 버튼이 「홈으로 가기」(비회원은 「처음으로」)로 바뀐다
```

클라이언트 측 복귀 규칙:

```text
/create/capture  frameId 없음          -> /create
/create/select   frameId 없음          -> /create
/create/select   shots 없음(찍기)      -> /create/capture
/create/result   frameId 없음          -> /create
/create/result   shots 없음            -> /create/select
/create/result   4장 선택 안 됨       -> /create/select
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
