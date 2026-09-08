// 필름 퍼포레이션 스트립 — 마케팅 페이지 섹션 경계에 쓰는 브랜드 모티프.
// 랜딩 HOW 섹션에서 시작해 기능 페이지까지 공통으로 쓰므로 한 곳에서 관리한다.
export function TapeStrip({
  className = "",
  running = false,
}: {
  className?: string;
  /** true면 필름이 감기듯 퍼포레이션이 흘러간다(prefers-reduced-motion은 globals.css에서 존중). */
  running?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={`h-4.5 bg-[repeating-linear-gradient(90deg,transparent_0_12px,rgba(255,255,255,.07)_12px_22px)] ${
        running ? "hc-film-strip" : ""
      } ${className}`}
    />
  );
}
