import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <main className="h-dvh overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white">
      <div className="mx-auto flex h-full w-full max-w-5xl items-center px-4">
        <div className="grid w-full items-center gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-10">
          <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="inline-block h-1 w-6 rounded-full bg-emerald-400" />
                TODAY&apos;S RECORD
              </span>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                Recorday
              </h1>
              <p className="text-xs text-zinc-300 md:text-sm">
                특별한 오늘을 네 컷으로
                <br />
                간직해 보세요.
              </p>
            </header>

            <p className="text-[11px] text-zinc-400 md:text-xs">
              8장을 자동 촬영하고, 마음에 드는 4장을 골라 나만의 인생네컷을 만들
              수 있어요.
            </p>

            <div className="flex flex-col gap-3">
              <Link
                href="/home"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 py-2.5 text-xs font-semibold hover:bg-emerald-400 transition-colors md:py-3 md:text-sm"
              >
                인생네컷 만들기 시작하기
              </Link>

              <div className="flex flex-col gap-2 text-[10px] text-zinc-500 md:text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-px flex-1 bg-zinc-700" />
                  <span>어디서든 오늘의 기록을 이어서 보고 싶다면</span>
                  <span className="h-px flex-1 bg-zinc-700" />
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/login"
                    className="flex-1 rounded-full border border-zinc-700 bg-zinc-900/40 py-2 text-center text-[11px] text-zinc-200 hover:bg-zinc-800 md:py-2.5"
                  >
                    로그인
                  </Link>
                  <Link
                    href="/signup"
                    className="flex-1 rounded-full border border-emerald-500/80 bg-emerald-500/10 py-2 text-center text-[11px] text-emerald-300 hover:bg-emerald-500/20 md:py-2.5"
                  >
                    회원가입
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <section className="mx-auto flex w-full max-w-xs flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-3 backdrop-blur-md shadow-[0_18px_45px_rgba(0,0,0,0.7)] md:max-w-sm md:p-4">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 md:text-[11px]">
              <span>Sample Image</span>
            </div>

            <div className="relative aspect-[3/5] w-full max-h-[320px] rounded-2xl border border-white/10 bg-black overflow-hidden md:max-h-[380px]">
              <Image
                src="/hero-image.png"
                alt="recorday 인생네컷 샘플"
                fill
                sizes="(max-width: 768px) 100vw, 400px"
                className="object-contain"
                priority
              />
            </div>

            <p className="text-[10px] leading-relaxed text-zinc-400 md:text-xs">
              나만의 포토부스를 지금 바로 시작해 보세요.
            </p>

            <div className="hidden flex-wrap gap-2 text-[10px] text-zinc-400 sm:flex">
              <span className="rounded-full border border-zinc-700 px-2 py-0.5">
                # 인생네컷
              </span>
              <span className="rounded-full border border-zinc-700 px-2 py-0.5">
                # 오늘의기록
              </span>
              <span className="rounded-full border border-zinc-700 px-2 py-0.5">
                # Recorday
              </span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
