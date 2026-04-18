"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

type BrandMarkProps = {
  href: string;
  label?: string;
  compact?: boolean;
  className?: string;
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
      <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/5 text-emerald-200">
        <Sparkles className="h-4 w-4" />
      </span>
      {!compact ? (
        <span className="flex min-w-0 flex-col">
          <span className="text-[10px] uppercase tracking-[0.26em] text-zinc-500">
            Record your four cuts
          </span>
          <span className="text-base font-semibold tracking-tight text-white">
            {label}
          </span>
        </span>
      ) : (
        <span className="text-sm font-semibold tracking-tight text-white">
          {label}
        </span>
      )}
    </Link>
  );
}
