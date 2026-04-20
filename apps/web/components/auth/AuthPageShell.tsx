"use client";

import type { ReactNode } from "react";
import { PageHeader } from "../layout/PageHeader";

type Props = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthPageShell({ title, description, children, footer }: Props) {
  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)] px-2 py-6 text-[color:var(--hc-text)]">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader
          title={title}
          description={<>{description}</>}
          brandHref="/"
        />

        {children}

        {footer ? <div className="pt-1">{footer}</div> : null}
      </div>
    </main>
  );
}
