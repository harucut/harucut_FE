---
name: Harucut Web
description: 부스를 주머니에 넣은 네컷 스튜디오 — 딥다크 무대 위, 초록은 아껴 쓴다
colors:
  primary: "#1ed760"
  primary-strong: "#56dd86"
  primary-hover: "#1fe267"
  primary-contrast: "#06140a"
  stage: "#0b0b0c"
  stage-tint: "#161617"
  surface: "#18181a"
  surface-highlight: "#232325"
  text: "#ffffff"
  muted: "#b3b3b3"
  muted-soft: "#6f6f73"
  border: "rgba(255, 255, 255, 0.1)"
  border-strong: "rgba(255, 255, 255, 0.2)"
  accent-soft-bg: "rgba(30, 215, 96, 0.16)"
  accent-soft-text: "#7beaa6"
  light-primary: "#16b454"
  light-primary-strong: "#0b6b30"
  light-stage: "#fafaf7"
  light-stage-tint: "#f1f1ee"
  light-surface: "#ffffff"
  light-text: "#14140f"
  light-muted: "#5c5c57"
typography:
  display:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, -apple-system, sans-serif"
    fontSize: "clamp(2.875rem, 7vw, 5.5rem)"
    fontWeight: 900
    lineHeight: 1.18
    letterSpacing: "-4px"
  # 보조 마케팅 히어로(행사 등). 랜딩 히어로(display)보다 한 단 작다.
  # 34px에서 58px까지 매끈하게 커진다 — 브레이크포인트마다 튀지 않게 클램프로 적는다.
  display-sm:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, sans-serif"
    fontSize: "clamp(2.125rem, 5vw, 3.625rem)"
    fontWeight: 800
    lineHeight: 1.14
    letterSpacing: "-1px"
  headline:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2.125rem)"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.8px"
  # 마케팅 화면(랜딩·기능·행사)의 섹션 제목. headline 클램프의 중간 지점을 고정값으로
  # 쓰는 자리가 네 곳 있어(랜딩 1, 기능 2, 행사 1) 단계로 적어 둔다.
  headline-sm:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.6px"
  # 히어로 아래 한 문단. 본문(15px)보다 크고 headline 최소값(24px)보다 작은 자리다.
  lede:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  title:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, sans-serif"
    fontSize: "1rem"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "-0.3px"
  body:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  body-md:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  body-sm:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label-lg:
    fontFamily: "Pretendard Variable, Pretendard, SUIT, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "1.2px"
rounded:
  chip: "9999px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  hero: "28px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "20px"
  lg: "36px"
  xl: "56px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-contrast}"
    rounded: "{rounded.chip}"
    padding: "12px 20px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-neutral:
    backgroundColor: "#ffffff"
    textColor: "{colors.stage}"
    rounded: "{rounded.chip}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.surface-highlight}"
    textColor: "{colors.text}"
    rounded: "{rounded.chip}"
    padding: "12px 20px"
  chip-accent:
    backgroundColor: "{colors.accent-soft-bg}"
    textColor: "{colors.accent-soft-text}"
    rounded: "{rounded.chip}"
    padding: "0 12px"
    height: "28px"
    typography: "{typography.label}"
  card-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input-field:
    backgroundColor: "{colors.surface-highlight}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
---

# Design System: Harucut Web

## Overview

**Creative North Star: "주머니 속 스튜디오"**

하루컷은 역 앞 네컷 부스를 통째로 주머니에 넣은 제품이다. 그래서 화면은 놀이터가 아니라 **장비**처럼 생겼다. 딥다크 무대(#0B0B0C) 위에 요소를 정확히 놓고, 숫자와 라벨은 모노 서체로 각을 세우고, 노출 게이지와 테이프 스트립처럼 실제 촬영 장비의 부품을 빌려 쓴다. 정밀함이 신뢰를 만든다 — 이 화면이 내 사진을 제대로 다룰 것 같다는 느낌.

**들뜸은 UI가 아니라 사진이 만든다.** 인터페이스는 조용히 물러나고, 화면에서 가장 밝고 가장 색이 많은 것은 항상 사용자의 네 컷이다. 초록(#1ED760)은 장식이 아니라 **지금 여기를 보라는 신호**다. 한 화면에서 초록이 여러 곳에 흩어지는 순간 그 신호는 죽는다.

라이트 테마는 다크의 반전이 아니라 **같은 스튜디오의 낮**이다. 무대가 종이(#FAFAF7)로 바뀌고 아래로 갈수록 한 톤 어두워지며(#F1F1EE), 초록도 한 단계 어두워진다(#16B454). 절제와 정밀함이라는 성격은 그대로다.

**Key Characteristics:**
- 어두운 무대, 밝은 피사체 — 사진이 언제나 화면에서 가장 밝다
- 아껴 쓰는 초록 — 강조는 한 화면에 하나
- 모노 라벨과 숫자 — 장비의 계기판 같은 정확함
- 필름의 리듬 — 테이프 스트립, 노출 게이지, 한 칸씩 감기는 단계
- 알약형 컨트롤 — 누를 것은 둥글게, 담을 것은 각지게

**확실한 안티레퍼런스:** 보라색 그라데이션에 둥근 카드를 얹은 **흔한 SaaS 대시보드**(어느 제품에 붙여도 말이 되는 모양), 그리고 **유치한 캐릭터·이모지 범벅**. 네컷 앱이 흔히 가는 길이지만 하루컷은 가지 않는다.

## Colors

어둠은 넓게, 색은 좁게. 팔레트의 대부분은 무채색 층이고 채도는 초록 하나에만 있다.

### Primary
- **비비드 그린** (#1ED760): 유일한 강조색. 주요 CTA, 활성 단계, 선택된 상태, 진행 게이지에만 쓴다. 다크 무대 위에서 유일하게 채도가 있는 것이라 눈이 반드시 여기로 간다.
- **소프트 그린** (#56DD86): 그린 위에 얹는 두 번째 톤. 그라데이션 끝, 브랜드 배지 글자처럼 초록이 넓은 면적을 차지할 때 눈부심을 덜어낸다.
- **딥 그린 컨트라스트** (#06140A): 초록 버튼 위의 글자색. 검정이 아니라 초록기가 도는 아주 어두운 값이라, 버튼이 스티커처럼 붕 뜨지 않고 무대에 붙어 있다.

### Neutral
- **무대 검정** (#0B0B0C): 페이지 바탕. 순검정(#000)이 아니다 — 아주 살짝 든 회색기가 화면을 판이 아니라 공간으로 만든다.
- **무대 틴트** (#161617): 페이지 하단으로 갈수록 밝아지는 그라데이션의 끝, 그리고 한 단계 올라온 면.
- **표면** (#18181A) / **하이라이트 표면** (#232325): 카드와 입력의 바탕. 이 둘의 차이가 다크에서 깊이를 만드는 주된 수단이다.
- **본문 흰색** (#FFFFFF): 제목과 본문.
- **뮤트 그레이** (#B3B3B3): 부연 설명. 본문 대비 4.5:1을 넘긴다.
- **소프트 뮤트** (#6F6F73): 플레이스홀더와 비활성 표시. **본문에는 쓰지 않는다** — 대비가 모자란다.

### Named Rules
**한 화면 한 초록 규칙.** 하나의 뷰포트에서 초록으로 칠하는 요소는 원칙적으로 하나다. 주 CTA가 초록이면 그 화면의 칩·아이콘·게이지는 초록을 양보한다. 초록이 둘 이상 보이면 사용자는 어디를 눌러야 할지 다시 생각한다.

**흐린 글자 금지 규칙.** 라이트 테마의 `--hc-primary`(#16B454)는 흰 배경에서 2.73:1, accent-soft 배경에서는 2.2:1이라 **글자에도 아이콘에도 쓰지 않는다**(아이콘은 3:1 기준도 못 넘긴다). 둘 다 `--hc-primary-strong`(#0B6B30)을 쓴다 — 가장 밝은 표면 기준 최소 5.37:1이다. `--hc-primary`는 **면을 채울 때만** 쓴다.

**사진이 제일 밝다 규칙.** 어떤 장식도 사용자의 사진보다 밝거나 채도가 높으면 안 된다. 배경 글로우는 blur와 낮은 불투명도로 뭉개서 무대 조명 수준에 둔다.

## Typography

**Display / Body Font:** Pretendard Variable (Pretendard, SUIT, -apple-system 폴백)
**Label / Mono Font:** ui-monospace (SFMono-Regular, Menlo)

**Character:** 한국어를 제대로 다루는 산세리프 하나로 전부 소화하고, 계기판 성격의 정보(단계 번호, 촬영 카운트, 축 라벨)만 모노로 떼어낸다. 서체를 늘리는 대신 **굵기 대비를 크게 벌린다** — 900과 400 사이가 이 시스템의 주된 위계 장치다.

### Hierarchy
작은 글자 스텝은 **11 / 12 / 13 / 14 / 15 / 16px** 여섯 개뿐이다. 0.5px 단위 중간값은 쓰지 않는다 —
눈에 보이지도 않으면서 스텝만 두 배로 늘린다. 11px 미만도 쓰지 않는다(한국어 가독 하한).

- **Display** (900, clamp 46→88px, 1.18, tracking -4px): 랜딩 헤드라인 전용. 화면을 압도하는 크기가 의도다.
- **Headline** (800, 19~40px, 1.25, tracking -0.8px): 섹션 제목, 페이지 타이틀.
- **Title** (800, 15~16px, 1.4): 카드 제목, 버튼 라벨.
- **Body** (400, 13~15px, 1.6~1.75): 설명 문장. 읽는 문단은 최대 460px 폭으로 묶는다.
- **Label** (mono, 500, 11~12px, tracking 1.2px): 축 라벨, 단계 번호, 상태 표시. 이 시스템의 최소 크기다.

### Named Rules
**여섯 스텝 규칙.** 작은 글자는 11·12·13·14·15·16px 중 하나다. 12.5px 같은 중간값을 만들면
스텝이 흐려지고 화면마다 미묘하게 어긋난다. 11px 아래로는 내려가지 않는다.

**모노는 계기판에만 규칙.** 모노 서체는 읽는 글이 아니라 **읽히는 값**에만 쓴다. 숫자, 단위, 축 이름, 상태 코드. 모노로 된 문장이 나오면 잘못 쓴 것이다.

**터치 입력 16px 규칙.** iOS Safari는 16px 미만 입력에 포커스하면 화면을 확대한다. 디자인상 작은 입력을 쓰더라도 `pointer: coarse`에서는 16px로 올린다(globals.css에 이미 강제돼 있다).

## Layout

컨테이너는 최대 1160px로 묶고 좌우 여백은 모바일 28px, 데스크톱에서도 같은 축을 유지해 네비게이션·본문·푸터의 좌변이 정확히 맞는다. 읽는 문단만 안쪽에서 440~460px로 다시 좁힌다.

세로 리듬은 크게 벌린다. 섹션 간격은 56px 이상, 카드 내부는 16~24px. 다크 무대에서는 경계선보다 **여백이 구획을 만든다**.

랜딩 히어로는 `min-height: calc(100svh - 72px)`로 첫 화면을 채운다. `svh`를 쓰는 이유는 모바일 브라우저의 주소창 때문이다 — `vh`는 쓰지 않는다.

반응형은 단일 컬럼에서 시작해 `sm`(640) 이후 타이포를 키우고, `md`(768)/`lg`(1024)에서 3열 그리드로 펼친다. 캔버스 화면(촬영·꾸미기·에디터)은 예외로, 어느 폭에서도 캔버스 비율이 먼저고 패널이 그 주위를 재배치한다.

## Elevation & Depth

**다크는 색으로, 라이트는 그림자로 깊이를 만든다.** 다크 테마에서 면이 올라오는 방식은 그림자가 아니라 **명도 계단**이다: #0B0B0C → #161617 → #18181A → #232325. 그림자는 아주 크고 부드러운 값으로 카드가 무대에서 떠 있다는 느낌만 준다. 라이트 테마는 반대로 배경이 균일해서 그림자가 주된 깊이 수단이 된다.

### Shadow Vocabulary
- **카드** (`0 18px 40px rgba(0,0,0,0.5)`): 기본 카드.
- **카드 XL** (`0 20px 60px rgba(0,0,0,0.6)`): 넓은 패널.
- **히어로** (`0 24px 80px rgba(0,0,0,0.7)`): 첫 화면의 주인공 카드.
- **초록 버튼** (`0 10px 28px -12px rgba(30,215,96,0.5)`): 그림자에 색을 넣어 버튼이 스스로 빛나는 것처럼 보이게 한다. 초록 버튼에만 쓴다.

### Named Rules
**계단 우선 규칙.** 다크에서 요소를 띄우고 싶으면 먼저 배경 명도를 한 칸 올린다. 그림자를 더 진하게 만드는 건 그다음이다.

## Shapes

**누를 것은 알약, 담을 것은 사각.** 버튼·칩·토글은 전부 `border-radius: 9999px`다(코드에서 `rounded-full`이 압도적으로 많은 이유). 카드·패널·입력은 12~20px 라운드로 각을 남긴다. 히어로급 컨테이너만 28px까지 간다.

경계선은 아주 약하다 — 다크에서 `rgba(255,255,255,0.08~0.2)`. 선으로 나누기보다 **면의 명도 차이**로 나누고, 선은 그 위에 얹는 최소한의 힌트로만 쓴다.

## Components

### Buttons
- **Shape:** 완전한 알약(9999px).
- **Primary:** 비비드 그린 배경 + 딥 그린 글자, 색 그림자. 화면당 하나.
- **Hover / Focus:** 배경을 #1FE267로 한 단계 밝히고 그림자를 키운다. 180ms ease. 이동(translate)은 쓰지 않는다 — 장비는 흔들리지 않는다.
- **Neutral:** 흰 배경 + 검은 글자. 다크 무대에서 초록만큼 강하되 색을 쓰지 않아야 할 때(예: 히어로의 보조 CTA).
- **Secondary / Ghost:** 하이라이트 표면(#232325) 배경 또는 투명 + 얇은 테두리.

### Chips
- **Style:** 초록 16% 배경 + 30% 테두리 + 밝은 초록 글자(#7BEAA6). 높이 28px 안팎의 알약.
- **State:** 상태·요금제·개수 표시용. 누를 수 있는 것처럼 보이면 안 되므로 그림자를 주지 않는다.

### Cards / Containers
- **Corner Style:** 16px 기본, 넓은 패널은 20px.
- **Background:** 표면(#18181A). 한 단계 더 올릴 때만 하이라이트(#232325).
- **Shadow Strategy:** Elevation의 카드 그림자. 다크에서는 명도 계단이 먼저다.
- **Border:** `rgba(255,255,255,0.1)` 한 겹.
- **Internal Padding:** 16px, 넓은 카드는 20~24px.

### Inputs / Fields
- **Style:** 하이라이트 표면 배경, 12% 흰 테두리, 12px 라운드.
- **Focus:** 테두리가 초록으로 바뀌고 같은 색 1px 링이 붙는다. `outline: none`을 쓰되 **반드시 링으로 대체한다** — 포커스가 사라지면 키보드 사용자가 길을 잃는다.
- **Placeholder:** 소프트 뮤트(#6F6F73). 여기가 이 색의 정당한 용도다.

### Navigation
- 마케팅 네비는 투명 배경 위 얇은 하단 경계. 로고는 좌측, 주 CTA는 우측 알약 버튼.
- 앱 화면은 상단 `PageHeader`(브랜드/뒤로가기 + 타이틀 + 우측 슬롯) 하나로 통일한다.

### 필름 파츠 (시그니처)
이 시스템의 정체성은 여기 있다. **테이프 스트립**(`TapeStrip`)은 필름 구멍이 흐르는 가로 띠로 섹션을 나누고, **노출 게이지**(`.hc-film-progress`)는 현재 단계에 초록이 차오르는 얇은 바다. **등장 애니메이션**(`.hc-reveal`)은 opacity 0→1에 18px 상승, 0.6s. 셋 다 `prefers-reduced-motion`에서 즉시 최종 상태가 된다.

## Do's and Don'ts

### Do:
- **Do** 초록을 한 화면에 하나만 쓴다. 나머지 강조는 굵기와 여백으로 만든다.
- **Do** 라이트 테마의 글자 초록에는 `--hc-primary-strong`(#0E7E39)을 쓴다.
- **Do** 다크에서 깊이가 필요하면 배경 명도를 한 칸 올린다(#18181A → #232325).
- **Do** 누르는 것은 알약, 담는 것은 12~20px 사각으로 만든다.
- **Do** 숫자와 축 라벨은 모노 11px에 tracking 1.2px로 세운다.
- **Do** 모든 모션에 `prefers-reduced-motion` 대체 상태를 준다. 최종 상태를 보여주는 것이 정답이다.
- **Do** 읽는 문단은 440~460px로 묶는다.

### Don't:
- **Don't** 보라색 그라데이션 배경에 둥근 카드를 얹지 않는다. 그건 어느 제품에나 붙는 모양이다.
- **Don't** 캐릭터나 이모지로 친근함을 만들지 않는다. 친근함은 문구에서 나온다.
- **Don't** 글자에 그라디언트를 입히지 않는다. 헤드라인 강조어는 `.hc-accent-word`(단색 `--hc-primary`)를 쓴다. 강조는 굵기와 색으로 충분하고, 글자색이 투명해지면 접근성 검사가 대비를 계산하지 못해 그 글자가 검사에서 통째로 빠진다.
- **Don't** `--hc-muted-soft`(#6F6F73)를 본문 글자에 쓰지 않는다. 플레이스홀더와 비활성 전용이다.
- **Don't** 버튼 hover에 위치 이동을 넣지 않는다. 색과 그림자로만 반응한다.
- **Don't** 모바일 높이에 `100vh`를 쓰지 않는다. `svh`/`dvh`를 쓴다.
- **Don't** `outline: none`을 대체 없이 쓰지 않는다.
- **Don't** 사용자의 사진보다 밝거나 채도 높은 장식을 화면에 두지 않는다.
