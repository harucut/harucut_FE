"use client";

import Link from "next/link";
import { BRAND_MARK_BODY, BRAND_MARK_COLORS, BRAND_MARK_GLYPH, BRAND_MARK_VIEWBOX } from "@harucut/shared";

type BrandMarkProps = {
  href: string;
  tone?: "light";
};

/*
  로고 — 딥다크 라운드 안의 ㅎ. 위 획은 셔터, 긴 획은 카메라 윗면, 동그라미는 렌즈다. 색은 렌즈의 점 하나.

  좌표와 색은 `@harucut/shared` 가 쥔다. 앱 아이콘도 같은 값에서 굽기 때문이다
  (`scripts/gen-brand-icons.mjs`) — 여기 숫자를 적어 두면 한쪽만 고쳐져 갈라진다.
*/
function HieutMark({ size = 30 }: { size?: number }) {
  const { top, bar, ring, dot } = BRAND_MARK_GLYPH;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BRAND_MARK_VIEWBOX.width} ${BRAND_MARK_VIEWBOX.height}`}
      aria-hidden
      style={{ display: "block" }}
    >
      <rect width={BRAND_MARK_VIEWBOX.width} height={BRAND_MARK_VIEWBOX.height} rx={BRAND_MARK_BODY.radius} fill={BRAND_MARK_BODY.fill} />
      <rect {...top} fill={BRAND_MARK_COLORS.glyph} />
      <rect {...bar} fill={BRAND_MARK_COLORS.glyph} />
      <circle cx={ring.cx} cy={ring.cy} r={ring.r} fill="none" stroke={BRAND_MARK_COLORS.glyph} strokeWidth={ring.strokeWidth} />
      <circle {...dot} fill={BRAND_MARK_COLORS.accent} />
    </svg>
  );
}

export function BrandMark({
  href,
  tone,
}: BrandMarkProps) {
  // tone="light" 는 테마와 무관하게 어두운 무대(마케팅·로그인) 위에 설 때만 쓴다.
  const labelColor = tone === "light" ? "#FFFFFF" : "var(--hc-text)";
  return (
    <Link
      href={href}
      aria-label="하루컷 홈"
      className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90"
    >
      <HieutMark size={30} />
      <span
        className="text-lg font-extrabold tracking-tight"
        style={{ color: labelColor }}
      >
        하루컷
      </span>
    </Link>
  );
}
