"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: ReactNode;

  // 헤더 아래 설명
  description?: ReactNode;

  // 오른쪽: 링크 or 커스텀 액션
  backHref?: string;
  backLabel?: string;
  rightSlot?: string;

  showBrand?: boolean;
};

export function PageHeader({
  title,
  description,
  backHref = "",
  backLabel,
  rightSlot,
  showBrand = true,
}: Props) {
  return (
    <>
      <header className="flex items-center justify-between">
        <div className="flex flex-col">
          {showBrand && (
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              RECORDAY
            </span>
          )}
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        </div>

        {rightSlot ? (
          <Link
            href={backHref}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 border border-zinc-700 text-[11px]"
          >
            {rightSlot}
          </Link>
        ) : backHref && backLabel ? (
          <Link
            href={backHref}
            className="text-[11px] text-zinc-400 underline underline-offset-4"
          >
            {backLabel}
          </Link>
        ) : null}
      </header>

      {description ? (
        <p className="text-xs text-zinc-500">{description}</p>
      ) : null}
    </>
  );
}
