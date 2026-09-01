> **상태: 보관. 실행 기준 아님.**
>
> 2026-08-01 이후 갱신 없음. 그래서 **ADR-0003(2026-08-18)을 받지 못했다** — 앱이
> 자기 화면을 그리지 않고 웹을 웹뷰로 띄우는 셸이 된 결정. 이 문서 분량의 절반
> (§0.1, §1.1~1.4, §3, §5 모바일, §6.2, 부록 A)이 **지금 존재하지 않는 모바일 화면**을
> 상대로 말한다. `apps/mobile` 소스는 5개뿐이다. 현행 구조는
> [ADR-0003](../adr/ADR-0003-%EC%95%B1%EC%9D%84-%EC%9B%B9%EB%B7%B0-%EC%85%B8%EB%A1%9C.md)
> 과 [docs/mobile-shell.md](../mobile-shell.md) 을 본다.
>
> 그 밖에 이 문서를 참조하면 안 되는 이유:
> - **§2.1 「웹 var」 열은 12개 중 8개가 실재하지 않는 변수명이다.** 값은 채택됐지만
>   이름은 코드와 다르다. 토큰의 정본은 `apps/web/app/globals.css` 하나다.
> - **§2.2 AA 대비비 표는 이미 옮겼다** → `apps/web/DESIGN.md` 의 「대비비(AA) 실측」 절.
>   옮기면서 토큰 이름을 교정하고 값을 다시 계산했다(문서의 `textSoft`/`muted` 는
>   실제 `--hc-muted`/`--hc-muted-soft` 와 뒤바뀌어 있었다). **여기 표를 보지 말 것.**
> - §2.2 의 「라이트에서 그린 텍스트 금지」는 채택되지 않았다. 코드는 전용 토큰
>   `--hc-primary-strong` 을 신설해 허용하는 쪽으로 갔다(`globals.css:10-12`).
> - §7·§9 의 미결 항목(`*.aab`, `handoff/`, `deployimage/`)은 `.gitignore:57,60,61` 에서 종결됐다.
> - §2.1 의 `FRAME_BORDER_OPTIONS`·`BACKGROUND_SWATCHES`·§4 의 `FRAME_CATALOG` 은
>   레포에 존재한 적이 없다.
>
> 남겨 두는 이유: 딥다크+그린 전환의 **결정 기록**으로는 여전히 유효하다.
> 왜 블루를 버렸고 무엇을 무시하기로 했는지(§0 의 프레임 정책 등)가 여기에만 있다.

---

# 디자인 마이그레이션 계획 — Dark+Green "STUDIO" (모바일 + 웹)

> 2026-06-28 `b916432`로 동영상 기능 제거 — 영상 관련 서술은 무효.
> 2026-07-10 `13fe6ef`로 프레임리스 촬영 확정 — §0.5·§1.2·§3의 카메라 프레임
> 오버레이 계획은 폐기. 각 절의 배너 참고.

> 작성일: 2026-06-14
> 성격: 실행 계획 문서 (코드 변경 전 합의용)
> 입력: `handoff/` 디자인 핸드오프 패키지, `deployimage/` 배포 이미지 세트
> 원칙: **로직은 우리 것 유지, 비주얼은 핸드오프 디자인을 따른다.**

---

## 0. 확정된 결정 (사용자 답변 반영)

1. **적용 범위**: `apps/mobile` + `apps/web` **동시** 전환.
2. **색 아이덴티티**: 블루(#2563EB) → **딥다크 + 그린** 전면 전환. 핸드오프의 다크 토큰 + 사용자가 제공한 **라이트 토큰**(아래 §2)을 사용. **라이트/다크 둘 다 유지.** 웹 접근성 **AA 등급** 충족 확인 필수.
3. **프레임 정책**: 핸드오프의 **PNG 이미지 테마 프레임(choco/yearbook 등)은 전부 무시**(크기·간격 포함). 서비스는 **기존 프로그래매틱 4종**(`classic-4`/`wide-4`/`grid-4`/`polaroid-4`)만 사용. 꾸미기는 우리 컴포넌트 시스템으로.
4. **꾸미기 배경 이미지**: 꾸미기에서 **배경 이미지를 넣거나 고를 수 있게** 하고, 그 배경이 **프레임 사진 뒤에 깔리도록**. 꾸미기 UX는 쉽게.
5. **카메라 프레임 오버레이**: 촬영 시 카메라 위에 프레임이 제대로 보이도록. (진단 결과 §3 참고 — 웹엔 있고 **모바일엔 없음** → 모바일 신규 구현)

   > 폐기 — 2026-07-10 프레임리스 촬영 결정으로 대체. 촬영 중에는 프레임을 씌우지 않고 슬롯 비율만 반영한다.

---

## 1. 현황 진단 (양쪽 코드 실제 비교)

### 1.1 프레임 시스템 — 양쪽 동일 구조 (좋음)
- 모바일 `apps/mobile/components/harucut/frame.tsx`의 `FRAME_LAYOUTS` 와 웹 `apps/web/constants/frameLayouts.ts` 가 **같은 캔버스 규격**(예: classic-4 = 2000×6000, 슬롯 좌표 동일)을 공유.
- 둘 다 **순수 프로그래매틱**: 색 배경 + 슬롯 rect(%) + 컴포넌트(TEXT/STICKER/PHOTO) 오버레이. → 핸드오프의 PNG 방식은 **도입하지 않음**(결정 §0.3과 일치). 우리 4종만 리스킨.
- 사용자 제작 프레임 = `SavedFrame`(frameId + 색 + components 레이어). 웹은 `useRemoteFrameTheme(remoteFrameId, frameId)`로 원격 테마 로드.

### 1.2 카메라 오버레이 — **웹 O / 모바일 X** (사용자 질문 "사라진거야?"의 답)

> 폐기 — 2026-07-10 프레임리스 촬영 결정으로 대체. 촬영 중에는 프레임을 씌우지 않고 슬롯 비율만 반영한다.
- **웹** `apps/web/app/shoot/capture/page.tsx`:
  - 카메라 박스 비율 = **현재 찍을 슬롯 비율** (`layout.slots[shotCount % slots.length]`).
  - 카메라 위에 `<ThemeOverlaySvg layout data={themeData} viewBox={currentSlot} />` 를 `pointer-events:none`로 오버레이 → **지금 찍는 칸이 프레임에서 어떻게 보일지 실시간 표시**. 원격/사용자 프레임도 `useRemoteFrameTheme`로 반영.
- **모바일** `apps/mobile/screens/shoot-screens.tsx`(`ShootCaptureScreen`):
  - 카메라 박스 = 고정 `aspectRatio: 0.75`, **오버레이 없음**. 카운트다운 오버레이만 존재.
  - git 히스토리 전 구간 확인 결과 **모바일엔 프레임 오버레이가 한 번도 없었음** → "사라진 것"이 아니라 **원래 없던 것**. 사용자가 본 건 **웹**의 오버레이.
- **결론**: 모바일에 웹의 오버레이 패턴을 **이식**해야 함 (§3, 이번 작업의 핵심).

### 1.3 색 시스템 — 전면 교체 대상
- 모바일: `apps/mobile/constants/harucut-design.ts`의 `HARUCUT_THEME_COLORS`(light/dark) — 현재 블루 계열.
- 웹: `apps/web/app/globals.css`의 CSS 변수(`--hc-*`) + Tailwind.
- 둘 다 dark+green 토큰으로 교체. 모바일은 객체, 웹은 CSS var → **토큰 값만 매핑**하면 컴포넌트는 대부분 그대로.

### 1.4 배경 이미지 — 토대 존재
- 웹에 `apps/web/lib/themeBackground.ts`, `lib/canvas/composeFrame.ts` 존재 → 배경 합성 토대 있음. `ThemeBackground` 타입(`COLOR`/`IMAGE` 2종)은 웹 `lib/types/themeEditor.ts`와 모바일 `constants/harucut-data.ts`에 동일하게 정의됨. → §5에서 활용.

---

## 2. 디자인 토큰 전환 (Phase A)

### 2.1 토큰 매핑 표 (단일 출처)
핸드오프 `styles/harucut.css :root`(다크) + 사용자 제공 라이트 토큰을 정본으로 삼는다.

| 의미 | 다크 (핸드오프) | 라이트 (사용자 제공) | 모바일 키(`HarucutColors`) | 웹 var |
|---|---|---|---|---|
| 앱 베이스 | `#0B0B0C` | `#FAFAF7` | `background` | `--hc-bg` |
| 섹션 | `#161617` | `#F1F1EE` | `backgroundTint` | `--hc-bg-2` |
| 컨트롤 | `#232325` | `#E8E8E4` | `cardMuted` | `--hc-bg-3` |
| 카드 | `#18181A` | `#FFFFFF` | `card`/`cardStrong` | `--hc-card` |
| 본문 텍스트 | `#FFFFFF` | `#14140F` | `text` | `--hc-text` |
| 보조 텍스트 | `#B3B3B3` | `#5C5C57` | `textSoft` | `--hc-text-2` |
| 흐린 메타 | `#6F6F73` | `#94948D` | `muted` | `--hc-muted` |
| 라인 | `rgba(255,255,255,.10)` | `rgba(20,20,15,.10)` | `border` | `--hc-line` |
| **액센트 그린** | `#1ED760` | `#16B454` | `primary` | `--hc-primary` |
| 그린 press | `#1FE267` | `#129A47` | `primaryStrong` | `--hc-primary-press` |
| 그린 soft | `rgba(30,215,96,.16)` | `rgba(22,180,84,.14)` | `primarySoft` | `--hc-primary-soft` |
| 액센트 위 글자 | `#FFFFFF` | `#06140A`(다크 글자) | — | `--hc-on-primary` |

- `--panel`(풀다크 피처 패널 `#0B0B0C`)은 **라이트에서도 다크 유지** — 사진 무대용(사용자 명시).
- 기존 블루 토큰(`accent`, `backgroundGradient*`, `backgroundOrb*`, `shadow`)은 그린/뉴트럴 계열로 재매핑. `FRAME_BORDER_OPTIONS`(코발트 4종)·`BACKGROUND_SWATCHES`(블루 틴트)는 그린/뉴트럴 팔레트로 교체.

### 2.2 접근성 (AA) 검증 결과 — 토큰 사용 규칙
사용자 제공 라이트 토큰으로 대비비를 계산한 결과, **수정 없이 쓰면 일부 미달**. 아래 규칙을 지킬 것:

| 조합 | 대비비(근사) | AA 판정 | 처리 |
|---|---|---|---|
| 본문 `text`/`--hc-text` (양쪽) | 16~19:1 | ✅ AAA | 그대로 |
| 보조 `textSoft` 라이트 | 6.5:1 | ✅ AA | 그대로 |
| 보조 `textSoft` 다크(#B3B3B3) | 8.8:1 | ✅ AA | 그대로 |
| **`muted` 라이트(#94948D)** | ~3.0:1 | ⚠️ 본문 실패 | **대형 텍스트(≥18.66px Bold/24px)·장식 메타에만 사용**, 본문 금지 |
| **`muted` 다크(#6F6F73)** | ~3.7:1 | ⚠️ 본문 실패 | 동일 — 대형/장식에만 |
| **그린을 작은 글자색으로(라이트)** | ~2.7:1 | ❌ 실패 | **라이트에서 그린 텍스트 금지**. 그린은 채움/보더/뱃지 용도 |
| 그린 버튼 + 다크글자(양쪽) | 6.8~9.6:1 | ✅ AA | 그대로 (핸드오프 `btn-primary` 패턴) |
| 그린 텍스트 on 다크 | 9.6:1 | ✅ AA | 다크에선 그린 텍스트 OK |

**규칙 요약**: (1) 그린은 *라이트 배경의 작은 텍스트*로 쓰지 말 것 — 항상 채움/보더 + 그 위 다크 글자. (2) `muted` 그레이는 본문 대신 캡션/대형에만. 본문급 보조 텍스트는 `textSoft` 사용. 전환 후 `apps/web`의 기존 접근성 테스트(`*.test`/스토리)로 회귀 확인.

---

## 3. 카메라 프레임 오버레이 — 모바일 신규 구현 ★ (Phase B, 핵심)

> 폐기 — 2026-07-10 프레임리스 촬영 결정으로 대체. 촬영 중에는 프레임을 씌우지 않고 슬롯 비율만 반영한다.
> 아래 §3.1~§3.5는 당시 계획 기록으로만 남긴다. 실제 구현 기준은 §3.6.

웹 `capture/page.tsx` 패턴을 모바일 `ShootCaptureScreen`로 이식한다.

### 3.1 동작 사양
사용자 요구: **"카메라 크기도 실제 프레임 안에 들어가는 크기에 맞춰서 보이도록."** → 현재 웹처럼 *한 슬롯만 전체 폭으로 확대*하지 말고, **전체 프레임을 렌더하고 현재 촬영 칸 자리에 라이브 카메라를 끼워넣는** 방식을 권장(아래 옵션 §3.4 결정).

1. 카메라 박스 `aspectRatio`를 고정 0.75 → **현재 슬롯 비율**로: `currentSlot = layout.slots[shoot.shots.length % slots.length]`, `aspectRatio = currentSlot.width / currentSlot.height`.
2. `CameraView` 위에 **프레임 오버레이 레이어**(`pointerEvents="none"`, `position:absolute inset:0`)를 얹는다. 오버레이는 선택된 프레임의 컴포넌트(TEXT/STICKER/배경)를 **현재 슬롯 viewBox 기준**으로 렌더 → 지금 찍는 칸이 최종 프레임에서 어떻게 보일지 표시.
3. **사용자 제작 프레임 지원**: `shoot.selectedSavedFrameId`가 있으면 그 `SavedFrame.components`/배경을 오버레이에 사용(웹 `useRemoteFrameTheme` 대응). 없으면 기본 프레임의 슬롯 가이드(테두리/번호)만.
4. 슬롯 진행 표시: "지금 N/4 칸" 가이드 + 다음 칸 비율로 카메라가 바뀌는 피드백.

### 3.2 재사용 자산
- `FramePreview`(frame.tsx)에 이미 컴포넌트 오버레이 렌더 로직 존재 → **오버레이 전용 경량 변형**(슬롯 1개 viewBox로 클립)으로 추출하거나, `viewBoxSlot` prop 추가.
- `FRAME_LAYOUTS` 슬롯 좌표 그대로 사용(웹과 동일 규격이라 좌표 신뢰 가능).

### 3.3 검증
- 4종 프레임 각각에서 칸별 카메라 비율이 슬롯과 일치하는지.
- 사용자 제작 프레임 선택 시 데코가 오버레이에 정확히 표시되는지.
- `react-native-view-shot` 결과물(select/result의 `captureRef`)과 오버레이 미리보기가 시각적으로 일치하는지(좌표계 동일).

### 3.4 웹 픽셀 정합성 검증 결과 (사용자 "정확히 픽셀단위로 일치한지 확인" 요청)

세 경로의 좌표계를 코드 단위로 대조했다: **촬영 오버레이**(`capture/page.tsx` + `ThemeOverlaySvg` viewBox=슬롯) → **최종 미리보기**(`FramePreview.tsx`) → **실제 합성/내보내기**(`lib/canvas/composeFrame.ts`). 슬롯 좌표는 세 경로 모두 `FRAME_LAYOUTS`(예: classic-4 2000×6000, slot 1700×1200, x150/gap80)를 공유한다.

| 항목 | 일치 여부 | 근거 |
|---|---|---|
| **슬롯 사진 크롭** | ✅ 픽셀 일치 | 촬영 캡처(`capturePhotoToDataUrl`)가 영상을 슬롯 비율로 **센터 크롭** → 저장 사진이 이미 슬롯 비율 → 합성 `drawCover`/미리보기 `object-cover`에서 추가 크롭 없음. 보이는 영역 = 들어가는 영역. |
| **데코 위치/회전/스케일** | ✅ 픽셀 일치 | `ThemeOverlaySvg`와 `composeFrame.drawThemeOverlay`가 **동일 변환**: `translate(center) rotate scale translate(-w/2,-h/2)`, 동일 `lineHeight=round(fontSize*1.15)`, 절대좌표(`x,y`). 촬영 오버레이는 viewBox=슬롯 + `(x-vb.x, y-vb.y)`로 같은 영역을 클립해 보여줄 뿐 좌표 동일. |
| **좌우반전(미러)** | ✅ 일치 | 영상 `scale-x-[-1]`로 표시 + 캡처 시 `ctx.scale(-1,1)`로 동일 반전 저장 → 합성은 그대로 그림. 텍스트 오버레이는 양쪽 다 비반전. |
| **텍스트 세로 기준선** | ⚠️ **미세 불일치** | 화면 오버레이(SVG)는 `dominantBaseline="hanging"`, 최종 합성(canvas)은 `textBaseline="top"`. hanging↔top은 폰트 높이의 수 %만큼 세로 어긋남 가능 → **화면에서 본 텍스트 위치가 내보낸 PNG와 살짝 다를 수 있음.** (미리보기도 SVG라 화면끼리는 같지만 **둘 다 실제 출력과 어긋남**) |
| **미리보기 테두리/라운드** | ⚠️ 무시 가능 | `FramePreview`엔 `border`(1px)·`rounded-lg`·`p-2`가 있으나 abspos 슬롯은 padding을 무시하므로 사진 영역엔 영향 없음. 1px 보더/라운드만 PNG와 차이(육안 무시 수준). |
| **카메라 표시 크기** | ⚠️ **요구와 불일치** | 현재 촬영 박스는 `w-full`(컬럼 전체 폭)에 슬롯 비율 → **한 칸을 전체 폭으로 확대**해서 보여줌. 프레임 안에서 그 칸이 차지하는 실제 비율/위치로 보이지 않음 → 사용자 요구(§3.1)와 다름. |
| **기본 4종 프레임의 촬영 데코** | ⚠️ 누락 | `capture/page.tsx`는 `themeData ? <오버레이> : null` — **원격/사용자 프레임만** 오버레이 표시. 기본 4종은 촬영 중 프레임 컨텍스트가 **전혀 안 보임**(맨 카메라). |

**결론**: 슬롯 사진과 데코의 *좌표*는 픽셀 일치한다. 단 (1) **텍스트 기준선(hanging→`text-before-edge`로 통일)** 1건이 화면↔출력 정합성의 실제 버그, (2) **카메라를 슬롯 실제 크기/위치로 보이게 하기**(요구사항)와 (3) **기본 프레임도 촬영 중 프레임이 보이게** 하는 것이 개선 대상.

### 3.5 픽셀 정합 수정 항목 (양쪽 적용)

**완료**

- **텍스트 기준선 통일**: `ThemeOverlaySvg`의 `dominantBaseline="hanging"` → `"text-before-edge"`(canvas `textBaseline="top"`과 매칭). 폰트(`Pretendard`)·`fontSize`·`lineHeight` 공식은 이미 동일 → 이 한 줄로 화면=출력 정합. 변경 후 `FramePreview.test`/스토리 스냅샷 재확인.

**폐기 (프레임리스 촬영으로 대체)**

- ~~**카메라 = 슬롯 실제 풋프린트**: 촬영 화면을 *전체 프레임 렌더 + 현재 칸에 라이브 카메라* 구조로.~~
- ~~**기본 프레임 촬영 가이드**: `themeData`가 없어도 현재 슬롯 테두리/번호/보더색 가이드를 항상 표시.~~
- ~~**모바일 동일 적용**: 위 좌표 규칙을 그대로 모바일 오버레이(§3.1~3.3)에 적용.~~

### 3.6 현행 기준 — 프레임리스 촬영 (2026-07-10, `13fe6ef`)

- 촬영 화면은 **프레임을 씌우지 않는다.** 카메라 박스는 현재 슬롯 **비율만** 따른다.
- 프레임(배경·스티커·텍스트)은 **배치 단계부터** 적용된다. 촬영 → 선택 → 결과 순으로 갈수록 프레임 컨텍스트가 붙는다.
- 웹·모바일 동일 규칙. 촬영 중 오버레이가 없으므로 §3.4의 "촬영 오버레이 ↔ 출력" 정합 리스크는 사라졌고, 검증 대상은 **미리보기 ↔ 출력** 두 면으로 줄었다.

---

## 4. 프레임 정책 (Phase C — 주로 "하지 않기")

- 핸드오프 `assets/frames/*.png`, `assets/frames-data.js`(HC_FRAMES base64), `themes.jsx`(ThemedFrame), `ui.jsx`의 `ThemedFrame`/PNG 경로 → **도입하지 않음**. 핸드오프 프레임의 크기/간격/비율 수치도 무시.
- 우리 4종 `FRAME_LAYOUTS`/`frameLayouts.ts`는 **좌표 그대로 유지**, 색/보더/슬롯 배경만 dark+green 토큰으로 리스킨.
- `FRAME_CATALOG`(이름/뱃지/설명) 카피는 유지하되 톤만 점검.

---

## 5. 꾸미기 배경 이미지 (Phase D)

목표: 꾸미기에서 **배경 이미지를 넣거나(업로드) 고를 수(프리셋)** 있고, 그 배경이 **프레임 사진 칸 뒤에 깔린다.**

- **데이터**: `ThemeBackground`(`COLOR`/`IMAGE` 2종)가 모바일·웹 타입에 이미 존재. `IMAGE.key`(원격) 또는 로컬 uri로 배경 지정.
- **렌더 순서(z)**: 배경 이미지(최하단) → 슬롯 사진 → 컴포넌트(스티커/텍스트). `FramePreview`에 **배경 레이어**를 슬롯보다 아래에 추가.
- **웹**: `lib/themeBackground.ts` + `composeFrame.ts`에 배경 합성 경로가 있는지 확인 후, 없으면 사진 합성 이전 단계에 배경 draw 추가.
- **모바일**: `theme/sticker`(ThemeEditor) + `FramePreview`에 배경 선택 UI(프리셋 스와치 + 이미지 피커) 추가. `expo-image-picker` 이미 의존성에 있음.
- **UX 쉽게**: 배경 탭에 ① 단색 스와치 ② 프리셋 이미지 그리드 ③ "내 사진에서" 업로드. 선택 즉시 미리보기 반영.

---

## 6. 이미지 자산 교체 (Phase E)

`deployimage/`(= `handoff/deploy/` 동일본) 의 A안 로고/아이콘 세트로 교체.

### 6.1 웹 (`apps/web/public/` + 메타데이터)
- `favicon-16/32/48.png`, `favicon.png`, `apple-touch-icon.png`(180), `icon-192/512.png`, `icon-maskable-512.png`, `og-image.png`(1200×630), `wordmark(-dark).png`, `logo-mark.png`, `site.webmanifest` 배치.
- `<head>` 링크/매니페스트/`theme-color #0B0B0C`/OG 메타 갱신 (deployimage/README의 스니펫 기반). 최근 #319 SEO 메타 정비와 충돌 없는지 확인.
- 기존 `hero-image.png` 등은 톤 점검.

### 6.2 모바일 (`apps/mobile/assets/images/` + `app.json`)
- `icon.png`(1024 → `app-icon-1024.png`), `android-icon-foreground/background/monochrome`, `splash-icon.png`, `favicon.png` 교체.
- `app.json`의 `icon`/`android.adaptiveIcon`/`splash`/`web.favicon` 경로·배경색(`#0B0B0C`) 갱신. **adaptive icon 배경은 다크**(#0B0B0C), foreground는 그린 스트립 마크.
- 안드로이드 빌드 영향: 아이콘 교체는 prebuild 재생성 대상 — 릴리즈 빌드 절차(메모리: hoisted/서명) 그대로.

### 6.3 워드마크/로고 컴포넌트
- 핸드오프 `Mark`(그린 4컷 스트립 SVG) 시안을 우리 로고 컴포넌트와 대조. RN/웹 공용으로 SVG/이미지 채택 결정.

---

## 7. 저장소 정리 (Phase 0 — 즉시)

`불필요한건 ignore`:
- `harucut-release.aab`(76MB 빌드 산출물) → **`.gitignore`에 추가**(`*.aab`).
- `handoff/`, `deployimage/` → 이들은 **디자인 소스/배포 원본**. 작업 참고용이며 앱 번들에 포함되면 안 됨. 자산을 각 앱으로 복사한 뒤 **루트 `handoff/`·`deployimage/`는 `.gitignore` 처리**(또는 `docs/`로 보관 이동). → 확정 필요: 레포에 남길지/무시할지.
- `handoff/assets/frames-data.js`(712KB base64) 등 미사용 대용량은 확실히 무시.

> 메모: 자산 복사 전에 ignore하면 추적이 끊기니, **복사 → 커밋 → 원본 ignore** 순서.

---

## 8. 실행 순서 & 검증

| Phase | 내용 | 검증 | 비고 |
|---|---|---|---|
| 0 | gitignore 정리(aab/소스) | `git status` 깔끔 | 즉시, 저위험 |
| A | 토큰 dark+green + 라이트, AA 규칙 | 웹 접근성 테스트/스토리, 양 모드 스냅샷 | 광범위·저위험(값 매핑) |
| B | ~~모바일 카메라 오버레이~~ | — | **폐기** — 프레임리스 촬영(§3.6)으로 대체 |
| C | 프레임 리스킨(4종 유지) | 미리보기/캐러셀 시각 점검 | 저위험 |
| D | 꾸미기 배경 이미지 | 배경 z-order, 합성 결과, 업로드/프리셋 | 중위험(합성 변경) |
| E | 이미지 자산 교체 | 웹 파비콘/OG, 모바일 아이콘 빌드 | 저위험 |

- **CI 주의(메모리)**: 모바일 CI는 lint/typecheck만 → 카메라 오버레이·배경 합성·아이콘 런타임 회귀는 **로컬 실기기/번들 확인** 필수.
- 작업은 `issue/<번호>-<slug>` 브랜치 → develop PR → 순차 auto-merge 관례 준수.

---

## 9. 리스크 & 결정 대기

- ~~**카메라 오버레이 좌표계**~~ → 해소. 프레임리스 촬영(§3.6)으로 촬영 중 오버레이 자체가 없어졌다. 남은 정합 대상은 미리보기 ↔ 출력.
- **라이트 모드 그린 텍스트/뮤트 그레이**: §2.2 규칙 미준수 시 AA 미달 → 토큰 사용 린트/리뷰 체크.
- **배경 이미지 합성 성능/용량**: 모바일 대용량 배경 이미지 → 리사이즈/캐시 정책 필요.
- **대기 결정**: (a) `handoff/`·`deployimage/`를 레포에 남길지 vs ignore. (b) 라이트/다크 기본값(시스템 따름 vs 다크 고정). (c) 로고 마크를 SVG 컴포넌트 vs PNG로.

---

### 부록 A. 핸드오프 ↔ 우리 코드 대응

| 핸드오프 | 우리(모바일) | 우리(웹) |
|---|---|---|
| `styles/harucut.css :root` | `constants/harucut-design.ts` | `app/globals.css` |
| `app/ui.jsx FourCut/FRAMES` | `components/harucut/frame.tsx FramePreview` | `components/frame/FramePreview.tsx` |
| `app/create.jsx ShootStep` | `screens/shoot-screens.tsx ShootCaptureScreen` | `app/shoot/capture/page.tsx` |
| `app/themes.jsx ThemedFrame`(PNG) | **무시** | **무시** |
| `app/decorate.jsx` | `app/(app)/theme/sticker.tsx` | `app/theme/sticker` |
| `deploy/*` | `assets/images/*` + `app.json` | `public/*` + manifest |
