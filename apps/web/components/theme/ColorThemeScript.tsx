import { COLOR_THEME_BOOTSTRAP_SCRIPT } from "@/lib/colorTheme";

// 테마 부트스트랩은 첫 페인트 이전(HTML 파싱 시점)에 동기 실행돼야 라이트/다크 깜빡임(FOUC)을
// 막을 수 있다. 이 컴포넌트는 루트 레이아웃 <body> 최상단에 렌더되어 본문보다 먼저 파싱·실행되므로,
// 일반 <script>로 두면 인라인 코드가 동기 실행되어 data-theme가 페인트 전에 적용된다.
// (기존 next/script afterInteractive는 인터랙티브 이후 실행돼 초기 렌더에서 테마가 늦게 적용되며
//  FOUC가 발생했다. next/script beforeInteractive는 App Router 린트 룰과 충돌 소지가 있어 사용하지 않는다.)
export function ColorThemeScript() {
  return (
    <script
      id="harucut-color-theme"
      dangerouslySetInnerHTML={{ __html: COLOR_THEME_BOOTSTRAP_SCRIPT }}
    />
  );
}
