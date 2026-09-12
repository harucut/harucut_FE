"use client";

import Link from "next/link";
import {
  BRAND_MARK_BAR_SHADES,
  BRAND_MARK_BODY,
  BRAND_MARK_VIEWBOX,
  brandMarkBarRect,
} from "@harucut/shared";

type BrandMarkProps = {
  href: string;
  tone?: "light";
};

/*
  STUDIO 로고 — 딥다크 라운드 + 그린 4컷 스트립.

  좌표와 색은 `@harucut/shared` 가 쥔다. 앱 알림 아이콘도 같은 값에서 굽기 때문이다
  (`scripts/gen-notification-icon.mjs`) — 여기 숫자를 적어 두면 한쪽만 고쳐져 갈라진다.
*/
function FourCutMark({ size = 30 }: { size?: number }) {
  const width = Math.round(size * (BRAND_MARK_VIEWBOX.width / BRAND_MARK_VIEWBOX.height));
  return (
    <svg
      width={width}
      height={size}
      viewBox={`0 0 ${BRAND_MARK_VIEWBOX.width} ${BRAND_MARK_VIEWBOX.height}`}
      aria-hidden
      style={{ display: "block" }}
    >
      <rect
        width={BRAND_MARK_VIEWBOX.width}
        height={BRAND_MARK_VIEWBOX.height}
        rx={BRAND_MARK_BODY.radius}
        fill={BRAND_MARK_BODY.fill}
      />
      {BRAND_MARK_BAR_SHADES.map((color, index) => (
        <rect key={color} {...brandMarkBarRect(index)} fill={color} />
      ))}
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
      aria-label="Harucut home"
      className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90"
    >
      <FourCutMark size={30} />
      <span
        className="text-lg font-extrabold tracking-tight"
        style={{ color: labelColor }}
      >
        하루컷
      </span>
    </Link>
  );
}
