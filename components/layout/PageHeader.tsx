"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  backHref?: string;
  backLabel?: string;
  rightSlot?: ReactNode;
  rightHref?: string;
  brandHref?: string;
  showBrand?: boolean;
};

export function PageHeader({
  title,
  description,
  backHref = "",
  backLabel,
  rightSlot,
  rightHref,
  brandHref = "/home",
  showBrand = true,
}: Props) {
  return (
    <>
      <header className="flex items-center justify-between">
        <div className="flex flex-col">
          {showBrand && (
            <Link
              href={brandHref}
              className="text-[11px] tracking-[0.16em] text-zinc-500 transition-colors hover:text-white"
              aria-label="Home"
            >
              하루컷
            </Link>
          )}
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        </div>

        {rightSlot ? (
          rightHref ? (
            <Link
              href={rightHref}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-[11px]"
            >
              {rightSlot}
            </Link>
          ) : (
            <div className="flex items-center justify-center">{rightSlot}</div>
          )
        ) : backHref && backLabel ? (
          <Link
            href={backHref}
            className="text-[11px] text-zinc-400 underline underline-offset-4"
          >
            {backLabel}
          </Link>
        ) : null}
      </header>

      {description ? <p className="text-xs text-zinc-500">{description}</p> : null}
    </>
  );
}
