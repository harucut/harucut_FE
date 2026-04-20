import Link from "next/link";
import Image from "next/image";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";
import { BrandMark } from "@/components/layout/BrandMark";

export default function LandingPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_24%),radial-gradient(circle_at_88%_18%,_rgba(37,99,235,0.12),_transparent_18%),linear-gradient(180deg,#fcfdff_0%,#eef5ff_100%)] text-[color:var(--hc-text)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.28),transparent_42%,rgba(191,219,254,0.12)_100%)]" />
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-4 sm:px-5 sm:py-5">
        <header className="flex items-center justify-between gap-3">
          <BrandMark href="/" tone="light" />

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="rounded-full border border-[color:var(--hc-border)] bg-[rgba(255,255,255,0.76)] px-3 py-2 text-[10px] text-[color:var(--hc-text)] shadow-[0_10px_30px_rgba(37,99,235,0.08)] transition-all duration-300 ease-out hover:border-[rgba(37,99,235,0.28)] hover:bg-white sm:px-4 sm:text-[11px]"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[color:var(--hc-primary)] px-3 py-2 text-[10px] font-semibold text-white shadow-[0_16px_40px_rgba(37,99,235,0.24)] transition-all duration-300 ease-out hover:bg-[color:var(--hc-primary-strong)] sm:px-4 sm:text-[11px]"
            >
              회원가입
            </Link>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.08)] px-3 py-1 text-[11px] font-medium text-[color:var(--hc-primary-strong)]">
              오늘 하루를 네 컷으로 남겨보세요
            </div>

            <h1 className="mt-5 text-[30px] font-semibold tracking-[-0.04em] text-[color:var(--hc-text)] sm:text-[34px] md:text-[56px] md:leading-[1.02]">
              오늘의 순간을
              <span className="block bg-gradient-to-r from-[color:var(--hc-primary-strong)] via-[color:var(--hc-primary)] to-[#74a9ff] bg-clip-text text-transparent">
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
                className="inline-flex w-full items-center justify-center rounded-full bg-[color:var(--hc-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.24)] transition-all duration-300 ease-out hover:bg-[color:var(--hc-primary-strong)] hover:shadow-[0_22px_44px_rgba(29,78,216,0.2)] sm:w-auto"
              >
                시작하기
              </Link>
              <GuestTrialStartButton />
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-[color:var(--hc-muted)]">
              <span className="rounded-full border border-[rgba(148,163,184,0.3)] bg-[rgba(255,255,255,0.72)] px-3 py-1 shadow-[0_10px_24px_rgba(37,99,235,0.06)]">
                촬영
              </span>
              <span className="rounded-full border border-[rgba(148,163,184,0.3)] bg-[rgba(255,255,255,0.72)] px-3 py-1 shadow-[0_10px_24px_rgba(37,99,235,0.06)]">
                업로드
              </span>
              <span className="rounded-full border border-[rgba(148,163,184,0.3)] bg-[rgba(255,255,255,0.72)] px-3 py-1 shadow-[0_10px_24px_rgba(37,99,235,0.06)]">
                테마 편집
              </span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[340px] sm:max-w-[360px]">
            <div className="rounded-[30px] border border-[color:var(--hc-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,246,255,0.92))] p-4 shadow-[0_30px_80px_rgba(37,99,235,0.16)] backdrop-blur-xl">
              <div className="overflow-hidden rounded-[24px] border border-[rgba(148,163,184,0.24)] bg-[linear-gradient(180deg,#eff6ff_0%,#f8fbff_100%)]">
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
