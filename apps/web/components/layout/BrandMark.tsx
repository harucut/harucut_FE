"use client";

import Link from "next/link";

type BrandMarkProps = {
  href: string;
  tone?: "light";
};

// STUDIO 로고 — 딥다크 라운드 + 그린 4컷 그라데이션 스트립(A안).
const MARK_SHADES = ["#7BEAA6", "#4FDD86", "#2FD06B", "#17B551"];

function FourCutMark({ size = 30 }: { size?: number }) {
  const width = Math.round(size * 0.74);
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 24 32"
      aria-hidden
      style={{ display: "block" }}
    >
      <rect width="24" height="32" rx="6" fill="#0B0B0C" />
      {MARK_SHADES.map((color, i) => (
        <rect
          key={color}
          x="5"
          y={4 + i * 6.35}
          width="14"
          height="5"
          rx="1.6"
          fill={color}
        />
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
