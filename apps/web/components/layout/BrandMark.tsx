"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

type BrandMarkProps = {
  href: string;
  label?: string;
  compact?: boolean;
  className?: string;
  tone?: "dark" | "light";
};

export function BrandMark({
  href,
  label = "하루컷",
  compact = false,
  className = "",
}: BrandMarkProps) {
  return (
    <Link
      href={href}
      aria-label="Harucut home"
      className={`inline-flex items-center gap-3 transition-opacity hover:opacity-100 ${className}`.trim()}
    >
      <span
        className="grid h-10 w-10 place-items-center rounded-2xl border border-[color:var(--hc-border)]"
        style={{
          background: "var(--hc-brand-badge-bg)",
          color: "var(--hc-brand-badge-text)",
          boxShadow: "var(--hc-brand-badge-shadow)",
        }}
      >
        <Sparkles className="h-4 w-4" />
      </span>
      {!compact ? (
        <span className="flex min-w-0 flex-col">
          <span className="text-[10px] uppercase tracking-[0.26em] text-[color:var(--hc-brand-overline)]">
            Record your four cuts
          </span>
          <span
            className="text-base font-semibold tracking-tight text-[color:var(--hc-text)]"
          >
            {label}
          </span>
        </span>
      ) : (
        <span className="text-sm font-semibold tracking-tight text-[color:var(--hc-text)]">
          {label}
        </span>
      )}
    </Link>
  );
}
