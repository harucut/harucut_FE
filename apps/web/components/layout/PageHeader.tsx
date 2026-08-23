"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";

type Props = {
  title?: ReactNode;
  description?: ReactNode;
  backHref?: string;
  backLabel?: string;
  rightSlot?: ReactNode;
  rightHref?: string;
  rightLabel?: string;
  brandHref?: string;
  showBrand?: boolean;
  /**
   * 오른쪽 위 요소(뒤로가기·아이콘) **아래**에 붙는 것.
   *
   * 제목 옆에 끼우면 제목의 일부처럼 읽힌다. 부가 정보는 제목이 아니라
   * 오른쪽 열에 쌓는다.
   */
  rightBelow?: ReactNode;
};

export function PageHeader({
  title,
  description,
  backHref = "",
  backLabel,
  rightSlot,
  rightHref,
  rightLabel,
  brandHref = "/home",
  showBrand = true,
  rightBelow,
}: Props) {
  return (
    <>
      <header className="flex items-center justify-between">
        <div className="flex flex-col">
          {showBrand ? (
            <BrandMark
              href={brandHref}
              compact
              className="mb-1 opacity-80"
            />
          ) : null}
          {title ? (
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {rightSlot ? (
            rightHref ? (
              <Link
                href={rightHref}
                aria-label={rightLabel}
                className="hc-button-icon flex h-9 w-9 items-center justify-center rounded-full border text-[11px]"
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
          {rightBelow}
        </div>
      </header>

      {description ? (
        <p className="text-xs text-zinc-500">{description}</p>
      ) : null}
    </>
  );
}
