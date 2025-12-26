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
    <main className="min-h-dvh bg-zinc-950 text-white px-2 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader title={title} description={<>{description}</>} />

        {children}

        {footer ? <div className="pt-1">{footer}</div> : null}
      </div>
    </main>
  );
}
