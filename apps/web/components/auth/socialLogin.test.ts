/**
 * 소셜 로그인 버튼이 규정에서 벗어나지 못하게 잡아 두는 테스트.
 *
 * 여기 걸리는 것들은 취향 문제가 아니라 각 사 가이드 위반이다. 예전에 실제로 셋 다 어겼다 —
 * 카카오 라벨이 허용 목록 밖("카카오로 계속하기")이었고, 네이버 버튼색이 비규정색(#007A3D)이었고,
 * 웹과 앱이 서로 다른 크기·다른 색으로 그렸다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SOCIAL_BRAND_COLORS,
  SOCIAL_LABELS,
  SOCIAL_MARK_SIZE,
  SOCIAL_PROVIDER_ORDER,
  socialMarkToSvg,
} from "@harucut/shared";

const GLOBALS_CSS = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

/** globals.css 의 `:root` / `html[data-theme="dark"]` 각각에서 토큰 값을 뽑는다. */
function cssToken(name: string, theme: "light" | "dark"): string | null {
  const block =
    theme === "light"
      ? GLOBALS_CSS.slice(0, GLOBALS_CSS.indexOf('html[data-theme="dark"]'))
      : GLOBALS_CSS.slice(GLOBALS_CSS.indexOf('html[data-theme="dark"]'));
  const m = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "");

describe("소셜 로그인 규정", () => {
  describe("카카오 라벨", () => {
    // developers.kakao.com 디자인 가이드: "완성형과 축약형 레이블 외의 다른 레이블을 적용할 수 없습니다."
    // ("카카오로 시작하기"는 카카오싱크 도입 서비스 전용이라 우리는 쓸 수 없다.)
    const ALLOWED = ["카카오 로그인", "로그인", "Login with Kakao", "Login"];

    it("허용 목록 안의 문구만 쓴다", () => {
      expect(ALLOWED).toContain(SOCIAL_LABELS.kakao);
    });
  });

  describe("네이버", () => {
    it("지정색만 쓴다 — 임의로 어둡게 바꾸지 않는다", () => {
      // 가이드 2장 "지정 컬러는 반드시 지켜주세요", 5장 금지 예시 첫 항목이 "지정되지 않은 배경 컬러".
      // 2025년 하반기 개정으로 #03C75A → #03A94D 가 됐다.
      const DESIGNATED = ["#03a94d", "#05ac4f"];
      expect(DESIGNATED).toContain(SOCIAL_BRAND_COLORS.naver.light.bg.toLowerCase());
      expect(DESIGNATED).toContain(SOCIAL_BRAND_COLORS.naver.dark.bg.toLowerCase());
    });

    it("N 로고가 완성형 최소 규정 16px 이상이다", () => {
      // "N 로고 크기는 아이콘형 18px, 완성형 16px 이상을 사용하고"
      expect(SOCIAL_MARK_SIZE.naver).toBeGreaterThanOrEqual(16);
    });

    it("라벨이 로고 높이보다 작다", () => {
      // "텍스트는 로고 높이보다 작은 크기를 사용해야 해요." 라벨은 15px.
      expect(15).toBeLessThan(SOCIAL_MARK_SIZE.naver);
    });
  });

  describe("구글", () => {
    it("G 로고가 공식 크기 20px 이다", () => {
      // 공식 에셋 실측: 40px 버튼 안의 G 가 정확히 20×20. "크기나 색상을 변경할 수 없다".
      expect(SOCIAL_MARK_SIZE.google).toBe(20);
    });

    it("G 를 단색으로 칠하지 않는다", () => {
      // "모노크롬 G 사용 금지" — 4색이 전부 박혀 있어야 하고 currentColor 가 없어야 한다.
      const svg = socialMarkToSvg("google");
      expect(svg).not.toContain("currentColor");
      for (const fill of ["#EA4335", "#4285F4", "#FBBC05", "#34A853"]) {
        expect(svg).toContain(fill);
      }
    });
  });

  describe("마크 광학 크기", () => {
    it("세 마크가 시각 무게를 맞춘 값을 쓴다", () => {
      // 카카오싱크 "심볼은 타사의 심볼과 동등한 시각적 비중을 가져야 합니다",
      // 네이버 "타사 로그인 버튼과 같이 사용될 때 크기를 줄이는 것을 지양합니다",
      // 구글 "다른 서드파티 로그인 옵션과 최소한 동등하게 눈에 띄어야 한다".
      // 블러 유효지름이 같아지는 값 — 자세한 근거는 packages/shared/src/social-marks.ts 주석.
      expect(SOCIAL_MARK_SIZE).toEqual({ google: 20, kakao: 18, naver: 16 });
    });
  });

  describe("웹 CSS 토큰이 shared 와 어긋나지 않는다", () => {
    // 웹은 CSS 변수로, 앱은 shared 상수로 색을 읽는다. 둘이 갈라지면 예전처럼
    // 같은 버튼이 플랫폼마다 다른 색이 된다. 주석으로 "함께 맞춘다"고 적어 두는 대신 잡는다.
    const CASES = [
      ["--hc-social-kakao-bg", "kakao", "bg"],
      ["--hc-social-kakao-text", "kakao", "label"],
      ["--hc-social-naver-bg", "naver", "bg"],
      ["--hc-social-naver-text", "naver", "label"],
      ["--hc-social-google-bg", "google", "bg"],
      ["--hc-social-google-text", "google", "label"],
      ["--hc-social-google-line", "google", "line"],
    ] as const;

    for (const theme of ["light", "dark"] as const) {
      for (const [token, provider, key] of CASES) {
        it(`${theme} ${token}`, () => {
          const expected = SOCIAL_BRAND_COLORS[provider][theme][key];
          expect(expected).not.toBeNull();
          expect(norm(cssToken(token, theme) ?? "")).toBe(norm(String(expected)));
        });
      }
    }
  });

  it("웹과 앱이 같은 순서로 그린다", () => {
    expect(SOCIAL_PROVIDER_ORDER).toEqual(["kakao", "naver", "google"]);
  });
});
