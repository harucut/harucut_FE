"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BrandMark } from "../layout/BrandMark";
import { FramePreview } from "../frame/FramePreview";
import { DEMO_COUPLE_PHOTOS, DEMO_PHOTOS } from "@/constants/demoPhotos";

type Props = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 폰 머리 줄의 뒤로가기가 가는 곳. 로그인은 첫 화면, 가입·비밀번호 찾기는 로그인이다. */
  backHref?: string;
  /** 뒤로가기의 이름(화면에는 화살표만 보인다). */
  backLabel?: string;
};

/*
  무대의 두 프레임은 다른 사람들이다(2026-11-14). 같은 넉 장이 두 번 보였다 — 랜딩에서 먼저 고친 것과
  같은 까닭이다. 세로 4컷은 카페의 친구 둘, 2×2 는 커플이다(constants/demoPhotos.ts).
*/
const STRIP_PHOTOS = DEMO_PHOTOS;
const GRID_PHOTOS = DEMO_COUPLE_PHOTOS;

export function AuthPageShell({ title, description, children, footer, backHref = "/", backLabel = "처음 화면으로" }: Props) {
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
              images={STRIP_PHOTOS}
              borderColor="#0B0B0C"
              className="h-full! w-auto!"
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
              images={GRID_PHOTOS}
              borderColor="#0B0B0C"
              className="h-full! w-auto!"
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
            찍고, 꾸미고, 기록하는 나만의 네컷 사진.
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
          {/*
            폰은 앱의 다른 흐름 화면과 같은 머리 줄이다 — 왼쪽 뒤로가기, 가운데 제목(PageHeader 와 같은 모양).
            예전에는 왼쪽 위 작은 마크 아래 큰 「로그인」이 왼쪽에 붙어 머리가 둘처럼 보였다(2026-11-14).
            넓은 화면은 왼쪽 무대에 마크가 있으니 지금처럼 폼 위 왼쪽 큰 제목이다. 제목은 하나만 둔다.
          */}
          <div className="relative flex min-h-11 items-center justify-center lg:block lg:min-h-0">
            <Link
              href={backHref}
              aria-label={backLabel}
              title={backLabel}
              className="hc-button-icon absolute left-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border text-(--hc-muted) transition hover:text-(--hc-text) lg:hidden"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="px-14 text-center text-lg font-semibold tracking-tight text-(--hc-text) lg:px-0 lg:text-left lg:text-[28px] lg:font-extrabold">
              {title}
            </h1>
          </div>
          {description ? (
            <p className="mt-2 text-center text-sm leading-6 text-(--hc-muted) lg:text-left">{description}</p>
          ) : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="pt-5">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
