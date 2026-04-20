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
  tone = "light",
}: BrandMarkProps) {
  const isLight = tone === "light";

  return (
    <Link
      href={href}
      aria-label="Harucut home"
      className={`inline-flex items-center gap-3 transition-opacity hover:opacity-100 ${className}`.trim()}
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-2xl border ${
          isLight
            ? "border-[color:var(--hc-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.95))] text-[color:var(--hc-primary)] shadow-[0_16px_40px_var(--hc-shadow)]"
            : "border-white/10 bg-white/5 text-emerald-200"
        }`}
      >
        <Sparkles className="h-4 w-4" />
      </span>
      {!compact ? (
        <span className="flex min-w-0 flex-col">
          <span
            className={`text-[10px] uppercase tracking-[0.26em] ${
              isLight ? "text-[color:var(--hc-muted)]" : "text-zinc-500"
            }`}
          >
            Record your four cuts
          </span>
          <span
            className={`text-base font-semibold tracking-tight ${
              isLight ? "text-[color:var(--hc-text)]" : "text-white"
            }`}
          >
            {label}
          </span>
        </span>
      ) : (
        <span
          className={`text-sm font-semibold tracking-tight ${
            isLight ? "text-[color:var(--hc-text)]" : "text-white"
          }`}
        >
          {label}
        </span>
      )}
    </Link>
  );
}
