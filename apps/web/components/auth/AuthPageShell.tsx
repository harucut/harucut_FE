"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { BrandMark } from "../layout/BrandMark";
import { FramePreview } from "../frame/FramePreview";
import { DEMO_PHOTOS } from "@/constants/demoPhotos";

type Props = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  icon?: "lock";
};

// 사진은 추후 교체될 placeholder.
// 슬롯 넉 장에 서로 다른 사진이 들어간다(constants/demoPhotos.ts 주석 참고).
const COLLAGE = DEMO_PHOTOS;

export function AuthPageShell({ title, description, children, footer, icon }: Props) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* 브랜드 패널 — 데스크톱(lg+)에서만, handoff web 분할 레이아웃의 다크 스테이지.
          두 칸은 서로의 높이를 따라가지 않는다. 예전에는 grid 아이템이 행 높이만큼 늘어나서,
          입력이 많은 회원가입 화면에서 오른쪽이 길어지면 왼쪽 무대까지 같이 늘어났다
          (1440x900 에서 943px). 폼이 길어질수록 사진이 위로 밀리고 아래 문구는 화면 밖으로
          내려갔다. self-start 로 늘어나기를 끊고, h-dvh + sticky 로 무대는 한 화면에 고정한다. */}
      <aside className="relative hidden overflow-hidden bg-[#0B0B0C] p-14 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:self-start">
        <div className="relative z-10">
          <BrandMark href="/" tone="light" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div
            className="-mr-6 h-75 drop-shadow-2xl"
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
            className="h-82.5 drop-shadow-2xl"
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
            하루를
            <br />네 컷으로.
          </p>
          {/* 두 문장은 각각 한 줄로 고정 — max-w로 흘려보내면 어중간한 위치에서 접힌다. */}
          <p className="mt-3.5 whitespace-nowrap text-[15px] leading-[1.6] text-white/60">
            찍고, 꾸미고, 기록하는 나만의 인생네컷.
            <br />
            하루컷에 오신 걸 환영해요.
          </p>
        </div>
      </aside>

      {/* 폼 패널 — 테마(라이트/다크) 반응. 폰/태블릿에선 앱 스타일 단일 컬럼 */}
      {/* grid 아이템이라 min-width: auto 가 걸린다. 입력의 기본 고유 폭(약 213px)이 그대로
          최소 폭이 돼 320px 에서 컨테이너를 밀어냈다. min-w-0 으로 끊어 준다. */}
      {/* 위 정렬로 고정한다. 세로 가운데면 짧은 화면(비밀번호 찾기)만 로고가 115px 아래로 뛰어 화면을 오갈 때 튄다. */}
      <div className="hc-page-app flex min-w-0 items-start justify-center px-5 py-10 text-(--hc-text)">
        <div className="w-full max-w-95">
          <div className="mb-8 lg:hidden">
            <BrandMark href="/" />
          </div>
          {icon === "lock" ? (
            <div className="mb-5 grid h-15 w-15 place-items-center rounded-[18px] bg-(--hc-accent-soft-bg)">
              <Lock size={28} className="text-(--hc-primary-strong)" />
            </div>
          ) : null}
          <h1 className="text-[28px] font-extrabold tracking-tight text-(--hc-text)">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-(--hc-muted)">{description}</p>
          ) : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="pt-5">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
