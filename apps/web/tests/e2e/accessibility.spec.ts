import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { stubAuthenticatedApi } from "./fixtures/apiStub";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${Number(process.env.PORT ?? 3000)}`;

const publicRoutes = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/pricing",
  "/faq",
  "/features",
  "/enterprise",
  "/terms",
  "/privacy",
] as const;

// 인증이 필요한 화면. 편집 화면(/decorate, /theme/sticker)이 여기 빠져 있으면
// 정작 가장 복잡한 UI가 한 번도 검사되지 않는다.
const authenticatedRoutes = [
  "/home",
  "/shoot",
  "/upload",
  "/theme",
  "/history",
  "/mypage",
] as const;

/**
 * 직접 열면 세션 상태가 없어 되돌려보내는 화면들. UI 를 거쳐 들어가야 진짜 화면을 검사한다.
 * 프레임 에디터가 여기 해당한다(app/theme/page.tsx 가 진입을 만들어 준다).
 */
const routesReachedThroughUi = [
  {
    route: "/theme/sticker",
    async enter(page: Page) {
      await page.goto("/theme");
      // 프레임 목록이 오기 전에는 버튼이 비활성이다. 활성될 때까지 기다렸다 누른다 —
      // 예전에는 로딩 중에 눌러 클릭이 삼켜지고 /theme 에 남았다.
      const openEditor = page.getByRole("button", { name: "새 프레임 만들기" });
      await expect(openEditor).toBeEnabled();
      await openEditor.click();
    },
  },
  // 꾸미기 편집기는 "완성한 네컷"이 메모리에 있어야 열린다. 직접 열면 1초쯤 뒤
  // /home 으로 갈아타는데, 그 전에 스캔이 끝나 초록불이 뜨곤 했다(실측).
  // 업로드 흐름을 실제로 태워 진짜 편집기를 검사한다.
  {
    route: "/upload/result",
    enter: composeFourcutThroughUpload,
  },
  {
    route: "/decorate",
    async enter(page: Page) {
      await composeFourcutThroughUpload(page);
      await page.getByRole("button", { name: /네컷 꾸미기/ }).click();
      await page.waitForURL("**/decorate");
    },
  },
] as const;

/** 1×1 투명 PNG. 내용은 상관없고 "지원 형식의 파일"이면 된다. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** 업로드 → 4장 선택 → 결과 합성까지 실제 UI 로 태운다. */
async function composeFourcutThroughUpload(page: Page) {
  await page.goto("/upload");
  await page.getByRole("button", { name: "업로드 시작하기" }).click();
  await page.waitForURL("**/upload/select");

  // 등장 애니메이션(.hc-reveal)이 도는 동안에는 타일이 계속 움직여서 Playwright 가
  // "element is not stable" 로 클릭을 미루다 타임아웃한다(CI 에서 실제로 그랬다).
  // 클릭 전에 최종 상태로 고정한다.
  await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS });

  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 4 }, (_, index) => ({
      name: `a11y-${index}.png`,
      mimeType: "image/png",
      buffer: TINY_PNG,
    })),
  );

  // 네 장이 다 그려진 뒤에 고르기 시작한다. 목록이 커지는 도중에 누르면 그 사이 리렌더로
  // 노드가 교체돼(detached) 클릭이 날아간다.
  const tiles = page.getByRole("button", { name: /^\d+번 사진 선택$/ });
  await expect(tiles).toHaveCount(4);
  await waitForImagesToSettle(page);

  for (let index = 1; index <= 4; index += 1) {
    const tile = page.getByRole("button", { name: `${index}번 사진 선택` });
    await tile.click();
    // 눌린 것이 반영될 때까지 기다린다 — 선택되면 aria-label 이 "선택 해제"로 바뀐다.
    await expect(
      page.getByRole("button", { name: new RegExp(`^${index}번 사진 선택 해제`) }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "다음 단계로" }).click();
  await page.waitForURL("**/upload/result");
  await page.getByRole("button", { name: /네컷 꾸미기/ }).waitFor();
}

/**
 * 등장 애니메이션과 페이지 그라디언트를 **페이지 스크립트보다 먼저** 눌러 둔다.
 *
 * 예전에는 화면이 로드된 뒤에 스타일을 주입했다. 그런데 CSS 전이는 한번 시작되면 그 뒤에
 * transition-duration 을 0으로 바꿔도 끝까지 재생된다. 그래서 주입 시점이 전이 시작과
 * 겹치면 axe 가 반투명한 글자를 재서 실제 디자인과 무관한 대비 위반이 잡혔다
 * (프로덕션 빌드 mobile-chrome 에서 랜딩 부제가 #B3B3B3 대신 #424744 로 측정됐다).
 *
 * 문서가 만들어지는 시점에 넣으면 opacity 가 처음부터 1이라 전이 자체가 일어나지 않는다.
 */
async function installStableRenderStyles(page: Page) {
  await page.addInitScript((css: string) => {
    const inject = () => {
      const style = document.createElement("style");
      style.setAttribute("data-a11y-freeze", "");
      style.textContent = css;
      (document.head ?? document.documentElement).appendChild(style);
    };

    if (document.documentElement) inject();
    else document.addEventListener("DOMContentLoaded", inject, { once: true });
  }, `${FREEZE_ANIMATIONS_CSS}
${FLATTEN_PAGE_GRADIENT_CSS}`);
}

async function enableAuthenticatedContext(page: Page) {
  await installStableRenderStyles(page);
  await stubAuthenticatedApi(page);
  await page.context().addCookies([
    {
      name: "accessToken",
      value: "a11y-session",
      url: baseURL,
    },
  ]);
}

/**
 * 접근성 스캔은 "다 자리잡은 화면"을 봐야 한다.
 *
 * 등장 애니메이션(.hc-reveal)은 opacity를 0에서 1로 0.6초 동안 올린다. 재생 중에 axe가
 * 스캔하면 반투명 글자색이 배경과 섞여 계산돼, 실제 디자인과 무관한 대비 위반이 잡힌다.
 *
 * 스타일을 직접 주입해 최종 상태로 고정한다. Playwright의 `reducedMotion: "reduce"` emulation은
 * 이 설정에서 페이지에 닿지 않아(matchMedia가 계속 false) 쓸 수 없었다.
 */
const FREEZE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
  .hc-reveal {
    opacity: 1 !important;
    transform: none !important;
  }
`;

/**
 * 페이지 배경 그라디언트를 "가장 불리한 단색"으로 눌러 axe가 대비를 판정할 수 있게 만든다.
 *
 * 페이지 바탕이 그라디언트라 axe는 그 위의 거의 모든 글자를 incomplete("배경색을 확정할 수
 * 없음")로 내린다. 그 상태로 violations만 보면 실제 미달이 통째로 검사에서 빠진다.
 *
 * 값은 각 그라디언트의 스톱 중 **대비가 가장 나쁘게 나오는 쪽**을 골랐다.
 * 라이트는 어두운 끝(#f1f1ee), 다크는 밝은 끝(#161617)이다. 그래서 이 단언은 실제보다
 * 관대해질 수 없다 — 통과하면 그라디언트 어느 지점에서도 통과한다.
 */
const FLATTEN_PAGE_GRADIENT_CSS = `
  :root {
    --hc-page-gradient-app: #f1f1ee !important;
    --hc-page-gradient-showcase: #f1f1ee !important;
    --hc-page-gradient-landing: #f1f1ee !important;
  }
  html[data-theme="dark"] {
    --hc-page-gradient-app: #161617 !important;
    --hc-page-gradient-showcase: #161617 !important;
    --hc-page-gradient-landing: #161617 !important;
  }
`;

/**
 * 온보딩 코치마크(components/onboarding/CoachMarks.tsx)가 뜰 때까지 기다린다.
 *
 * 코치마크는 hydration 뒤 effect가 걸고 350ms 지난 뒤에 뜬다. 그 전에 스캔하면 어떤
 * 실행에서는 검사되고 어떤 실행에서는 빠져서, 느린 러너에서만 위반이 잡힌다.
 * 스토리지 키가 비어 있는 새 컨텍스트에서는 반드시 뜬다.
 */
async function waitForCoachMark(page: Page) {
  await page
    .getByRole("dialog", { name: "기능 안내" })
    .waitFor({ state: "visible" });
}

/**
 * axe의 색 대비 판정에는 violations 말고 incomplete("판정 불가")도 있다. 그 안에 실제
 * 미달이 섞여 있어도 violations만 보면 통과로 읽히므로, 대비만큼은 판정 불가도 실패로 둔다.
 *
 * 다만 페이지 바탕을 눌러도 끝내 남는 사유가 둘 있다.
 *
 * 남는 것들은 전부 **지역 장식 레이어**(카드 위 흰 7% 시트, 히어로 초록 글로우,
 * 사진 위 SVG 문구) 때문이고, 이건 axe가 원리적으로 못 푼다.
 *
 * 그래서 이 사유 하나만 통과시키고 나머지 사유(배경 이미지, 가상 요소 등)는 그대로 실패로 둔다.
 * 근거는 색을 개별로 눈감아 준 게 아니라 **토큰 자체를 다시 잡은 것**이다 — 본문에 쓰이는
 * 모든 뮤트·강조 토큰을 가장 밝은 표면(#dbebdf) 기준 4.67:1 이상으로 재산출했고,
 * 판정 불가로 남는 대표 지점 두 곳은 캔버스 합성으로 직접 재서 확인했다:
 *   - 프레임 카드 배지 (#0b6b30 on rgb(238,238,234)) = 5.71:1
 *
 * 사진 위 SVG 문구만은 배경이 콘텐츠라 어떤 값으로도 보장할 수 없다. 별도 과제로 남긴다.
 */
const UNDETERMINABLE_REASONS = [
  // 지역 장식 레이어(카드 위 흰 시트, 히어로 글로우).
  /background gradient/i,
  // 사진 위 글자. 배경이 콘텐츠라 어떤 토큰으로도 보장할 수 없다.
  // 히어로 이미지와 프레임 미리보기 SVG 문구가 여기 걸린다.
  // 남은 과제: 사진 위 글자에는 스크림이나 그림자를 깔아 콘텐츠와 무관하게 읽히게 만든다.
  /contains an image node/i,
  // 장식 레이어가 글자 위를 지나가 axe가 배경을 특정하지 못하는 경우(랜딩 히어로의
  // 초록 글로우와 프레임 미리보기). 실제 값은 #B3B3B3 on #0B0B0C = 9.38:1로 안전하다.
  /overlapped by another element/i,
  /partially obscured by another element/i,
  // 글자가 한 글자뿐이라 axe가 "이게 글자인지" 자체를 판단하지 못하는 경우
  // (요금제 비교표의 체크·대시 기호). 대비가 아니라 판별의 문제다.
  /too short to determine/i,
];

/**
 * 대비 검사에서 빼는 딱 하나 — 네이버 로그인 버튼.
 *
 * 네이버 가이드는 로그인 버튼의 배경과 글자색을 못박는다: "지정 컬러는 변경할 수 없으며",
 * 그리고 금지 예시의 첫 항목이 "가이드에 지정되지 않은 배경 컬러"다. 지정 조합은
 * 배경 #03A94D + 로고·레이블 #FFFFFF 인데, 이 조합의 대비가 3.09:1 이다. AA 문턱(4.5:1)에
 * 못 미친다. 다크 렌디션 #05AC4F 는 2.99:1 로 더 나쁘다.
 *
 * 즉 우리가 고를 수 있는 것은 "네이버 규정 위반"이거나 "AA 미달"이지 둘 다 만족하는 값이
 * 없다. 예전에는 앞쪽을 골라 #007A3D 로 어둡게 칠했는데(5.45:1), 그건 네이버가 이름을 대고
 * 금지한 바로 그 행위였다. 그래서 지금은 지정색을 쓰고 이 한 건만 사유를 적어 뺀다.
 * 네이버가 배포하는 공식 버튼 이미지 자체가 3.09:1 이라, 우리 화면이 벤더 산출물보다
 * 나빠지는 것은 아니다.
 *
 * 예외는 **색까지 정확히 일치할 때만** 성립한다. 배경이나 글자색이 바뀌면 이 필터가
 * 걸리지 않아 테스트가 다시 실패한다 — 아무 대비 문제나 삼키지 않는다.
 */
const BRAND_CONTRAST_EXEMPTIONS = [
  { selector: ".hc-social-naver", fgColor: "#ffffff", bgColor: "#03a94d" },
];

type ContrastData = { fgColor?: string; bgColor?: string };
type ViolationNode = { target?: unknown[]; any?: Array<{ data?: ContrastData }> };
type ViolationRule = { id: string; nodes: ViolationNode[] };

function isBrandExempt(node: ViolationNode) {
  const target = node.target?.map((t) => String(t)).join(" ") ?? "";
  return node.any?.some((check) =>
    BRAND_CONTRAST_EXEMPTIONS.some(
      (exempt) =>
        target.includes(exempt.selector) &&
        check.data?.fgColor?.toLowerCase() === exempt.fgColor &&
        check.data?.bgColor?.toLowerCase() === exempt.bgColor,
    ),
  );
}

/** 위 예외에 정확히 해당하는 대비 위반만 걷어낸다. 나머지 규칙은 손대지 않는다. */
function withoutBrandExemptions(violations: ViolationRule[]) {
  return violations
    .map((rule) =>
      rule.id === "color-contrast"
        ? { ...rule, nodes: rule.nodes.filter((node) => !isBrandExempt(node)) }
        : rule,
    )
    .filter((rule) => rule.id !== "color-contrast" || rule.nodes.length > 0);
}

type IncompleteNode = { any?: Array<{ message?: string }> };
type IncompleteRule = { id: string; nodes: IncompleteNode[] };

function contrastIncomplete(results: { incomplete: IncompleteRule[] }) {
  return results.incomplete
    .filter((rule) => rule.id === "color-contrast")
    .map((rule) => ({
      ...rule,
      nodes: rule.nodes.filter(
        (node) =>
          !node.any?.some((check) =>
            UNDETERMINABLE_REASONS.some((reason) =>
              reason.test(check.message ?? ""),
            ),
          ),
      ),
    }))
    .filter((rule) => rule.nodes.length > 0);
}

/**
 * 화면의 이미지가 다 자리잡을 때까지 기다린다.
 *
 * 스티커 타일은 next/image 로 지연 로드된다. 로딩 중인 이미지가 섞인 채 스캔하면 그 위 글자의
 * 배경이 그때그때 달라져 판정이 흔들린다(전체 실행에서 한 번 /decorate 가 그렇게 실패했다).
 * 아직 뷰포트에 안 들어온 이미지는 영영 로드되지 않으므로, "로딩 중"인 것만 기다린다.
 */
async function waitForImagesToSettle(page: Page) {
  await page.waitForFunction(() =>
    Array.from(document.images).every(
      (image) => image.complete || !image.getBoundingClientRect().width,
    ),
  );
}

async function expectNoAccessibilityViolations(page: Page, route?: string) {
  await page.locator("body").waitFor({ state: "visible" });
  await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS });
  await page.addStyleTag({ content: FLATTEN_PAGE_GRADIENT_CSS });
  await waitForImagesToSettle(page);
  // 웹폰트(Pretendard)가 바뀌면 글자 크기와 줄바꿈이 달라져 겹침 판정과 색 표본이 흔들린다.
  // 병렬 실행으로 로딩이 늦어질 때만 간헐적으로 터지던 원인이라 폰트까지 기다린다.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  // 경로 확인은 모든 대기가 끝난 **스캔 직전**에 한다. 앞쪽에서 보면 "한 순간 그 경로였다"만
  // 보장돼, 뒤늦게 갈아탄 화면을 검사하고도 초록불이 뜬다(/theme/sticker·/decorate 가 그랬다).
  if (route) expect(new URL(page.url()).pathname).toBe(route);

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(withoutBrandExemptions(accessibilityScanResults.violations)).toEqual([]);
  expect(contrastIncomplete(accessibilityScanResults)).toEqual([]);
}

/**
 * 검사 대상이 정말 그 화면인지 확인한다.
 *
 * 인증 라우트는 세션이 없으면 /login으로 갈아탄다. 그 상태로 스캔하면 초록불이 뜨지만
 * 검사한 것은 /login이다. 실제로 그렇게 6개 화면이 오랫동안 검사되지 않았다.
 */
async function expectStayedOn(page: Page, route: string) {
  await expect
    .poll(() => new URL(page.url()).pathname, {
      message: `${route} 로 갔는데 화면이 ${new URL(page.url()).pathname} 로 바뀌었습니다`,
    })
    .toBe(route);
}

for (const route of publicRoutes) {
  test(`public route ${route} has no obvious accessibility violations`, async ({
    page,
  }) => {
    await installStableRenderStyles(page);
    await page.goto(route);
    await expectStayedOn(page, route);

    await expectNoAccessibilityViolations(page, route);
  });
}

// 코치마크를 띄우는 화면. 지금은 /home 하나뿐이다(app/home/page.tsx의 <CoachMarks id="home-v1">).
const routesWithCoachMark = new Set<string>(["/home"]);

for (const route of authenticatedRoutes) {
  test(`authenticated route ${route} has no obvious accessibility violations`, async ({
    page,
  }) => {
    await enableAuthenticatedContext(page);
    await page.goto(route);
    await expectStayedOn(page, route);

    if (routesWithCoachMark.has(route)) {
      await waitForCoachMark(page);
    }

    await expectNoAccessibilityViolations(page, route);
  });
}

for (const { route, enter } of routesReachedThroughUi) {
  test(`authenticated route ${route} has no obvious accessibility violations`, async ({
    page,
  }) => {
    // 이 검사들은 화면을 UI 로 거쳐 들어간다. e2e 서버가 dev 서버(pnpm dev)라 CI 의 찬
    // 러너에서는 /upload, /upload/select, /upload/result, /decorate 를 그때그때 컴파일하고,
    // 그 합이 기본 제한 60초를 넘겨 타임아웃으로 죽었다. 검사 자체가 느린 게 아니라
    // 첫 컴파일이 느린 것이므로 이 묶음에만 여유를 준다.
    test.slow();

    await enableAuthenticatedContext(page);
    await enter(page);
    await expectStayedOn(page, route);

    await expectNoAccessibilityViolations(page, route);
  });
}
