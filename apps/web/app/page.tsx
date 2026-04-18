import Link from "next/link";
import Image from "next/image";
import { BrandMark } from "@/components/layout/BrandMark";

export default function LandingPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.14),_transparent_24%),linear-gradient(180deg,#09090b_0%,#111827_100%)] text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-4 sm:px-5 sm:py-5">
        <header className="flex items-center justify-between gap-3">
          <BrandMark href="/" />

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] text-zinc-200 transition hover:border-white/20 sm:px-4 sm:text-[11px]"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-white px-3 py-2 text-[10px] font-semibold text-zinc-950 transition hover:bg-zinc-100 sm:px-4 sm:text-[11px]"
            >
              회원가입
            </Link>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">
              오늘 하루를 네 컷으로 남겨보세요
            </div>

            <h1 className="mt-5 text-[30px] font-semibold tracking-[-0.04em] text-white sm:text-[34px] md:text-[56px] md:leading-[1.02]">
              오늘의 순간을
              <span className="block bg-gradient-to-r from-emerald-200 via-lime-100 to-white bg-clip-text text-transparent">
                다시 보고 싶은 네 컷으로
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-300 sm:text-[15px] sm:leading-7 md:text-base">
              촬영하고, 고르고, 저장하세요.
              오늘 하루 기록을 가볍게 남길 수 있어요.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/home"
                className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 sm:w-auto"
              >
                시작하기
              </Link>
              <Link
                href="/theme"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08] sm:w-auto"
              >
                프레임 먼저 꾸미기
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-zinc-400">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                촬영
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                업로드
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                테마 편집
              </span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[340px] sm:max-w-[360px]">
            <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur">
              <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/30">
                <div className="relative aspect-[3/4] w-full">
                  <Image
                    src="/hero-image.png"
                    alt="하루컷 샘플"
                    fill
                    sizes="(max-width: 1024px) 80vw, 360px"
                    className="object-cover"
                    priority
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-sm font-semibold text-zinc-100">
                  찍는 순간보다
                  <span className="block">다시 꺼내 볼 때 더 좋은 네 컷</span>
                </p>
                <p className="text-[12px] leading-6 text-zinc-400">
                  완성한 결과는 기록 페이지에서 다시 보고 공유할 수 있어요.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
