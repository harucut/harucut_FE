"use client";

import type { ReactNode } from "react";
import { BrandMark } from "../layout/BrandMark";
import { FramePreview } from "../frame/FramePreview";

type Props = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

// 사진은 추후 교체될 placeholder.
const COLLAGE = Array.from({ length: 4 }, () => "/hero-image.png");

export function AuthPageShell({ title, description, children, footer }: Props) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* 브랜드 패널 — 데스크톱(lg+)에서만, handoff web 분할 레이아웃의 다크 스테이지 */}
      <aside className="relative hidden overflow-hidden bg-[#0B0B0C] p-14 lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10">
          <BrandMark href="/" tone="light" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div
            className="-mr-6 h-[300px] drop-shadow-2xl"
            style={{
              transform: "rotate(-7deg) translateZ(0)",
              backfaceVisibility: "hidden",
              willChange: "transform",
            }}
          >
            <FramePreview
              frameId="classic-4"
              images={COLLAGE}
              borderColor="#0B0B0C"
              className="!h-full !w-auto"
            />
          </div>
          <div
            className="h-[330px] drop-shadow-2xl"
            style={{
              transform: "rotate(5deg) translateZ(0)",
              backfaceVisibility: "hidden",
              willChange: "transform",
            }}
          >
            <FramePreview
              frameId="grid-4"
              images={COLLAGE}
              borderColor="#0B0B0C"
              className="!h-full !w-auto"
            />
          </div>
        </div>
        <div className="relative z-10 mt-auto">
          <p className="text-[34px] font-extrabold leading-[1.2] tracking-[-1px] text-white">
            오늘 하루를
            <br />네 컷으로.
          </p>
          <p className="mt-3.5 max-w-[300px] text-[15px] leading-[1.6] text-white/60">
            찍고, 꾸미고, 기록하는 나만의 인생네컷. 하루컷에 오신 걸 환영해요.
          </p>
        </div>
      </aside>

      {/* 폼 패널 — 테마(라이트/다크) 반응. 폰/태블릿에선 앱 스타일 단일 컬럼 */}
      <div className="hc-page-app flex items-center justify-center px-5 py-10 text-[color:var(--hc-text)]">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 lg:hidden">
            <BrandMark href="/" />
          </div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-[color:var(--hc-text)]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-[color:var(--hc-muted)]">{description}</p>
          ) : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="pt-5">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
