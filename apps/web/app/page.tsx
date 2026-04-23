import Link from "next/link";
import Image from "next/image";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";
import { BrandMark } from "@/components/layout/BrandMark";

export default function LandingPage() {
  return (
    <main className="hc-page-landing relative isolate min-h-dvh overflow-hidden text-[color:var(--hc-text)]">
      <div className="hc-page-landing-overlay pointer-events-none absolute inset-0" />
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-4 sm:px-5 sm:py-5">
        <header className="flex items-center justify-between gap-3">
          <BrandMark href="/" tone="light" />

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hc-button-secondary rounded-full border px-3 py-2 text-[10px] transition-all duration-300 ease-out sm:px-4 sm:text-[11px]"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="hc-button-hero rounded-full px-3 py-2 text-[10px] font-semibold transition-all duration-300 ease-out sm:px-4 sm:text-[11px]"
            >
              회원가입
            </Link>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="max-w-2xl">
            <div className="hc-accent-chip inline-flex rounded-full border px-3 py-1 text-[11px] font-medium">
              오늘 하루를 네 컷으로 남겨보세요
            </div>

            <h1 className="mt-5 text-[30px] font-semibold tracking-[-0.04em] text-[color:var(--hc-text)] sm:text-[34px] md:text-[56px] md:leading-[1.02]">
              오늘의 순간을
              <span
                className="block bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, var(--hc-primary-strong), var(--hc-primary), var(--hc-hero-gradient-end))",
                }}
              >
                다시 보고 싶은 네 컷으로
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-[color:var(--hc-muted)] sm:text-[15px] sm:leading-7 md:text-base">
              촬영하고, 고르고, 저장하세요.
              오늘 하루 기록을 가볍게 남길 수 있어요.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/login"
                className="hc-button-hero inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-all duration-300 ease-out sm:w-auto"
              >
                시작하기
              </Link>
              <GuestTrialStartButton />
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-[color:var(--hc-muted)]">
              <span className="hc-surface-soft rounded-full border px-3 py-1">
                촬영
              </span>
              <span className="hc-surface-soft rounded-full border px-3 py-1">
                업로드
              </span>
              <span className="hc-surface-soft rounded-full border px-3 py-1">
                테마 편집
              </span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[340px] sm:max-w-[360px]">
            <div className="hc-surface-hero rounded-[30px] border p-4 backdrop-blur-xl">
              <div className="hc-surface-inset overflow-hidden rounded-[24px] border">
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
                <p className="text-sm font-semibold text-[color:var(--hc-text)]">
                  찍는 순간보다
                  <span className="block">다시 꺼내 볼 때 더 좋은 네 컷</span>
                </p>
                <p className="text-[12px] leading-6 text-[color:var(--hc-muted)]">
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
