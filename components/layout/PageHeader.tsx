"use client";

import Image from "next/image";
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
          {showBrand ? (
            <Link
              href={brandHref}
              className="inline-flex h-7 items-center opacity-80 transition-opacity hover:opacity-100"
              aria-label="Harucut home"
            >
              <Image
                src="/logo-harucut.svg"
                alt="HARUCUT"
                width={196}
                height={40}
                className="h-6 w-auto"
                priority
              />
            </Link>
          ) : null}
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

      {description ? (
        <p className="text-xs text-zinc-500">{description}</p>
      ) : null}
    </>
  );
}
