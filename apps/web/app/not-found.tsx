import Link from "next/link";

/**
 * 없는 주소로 들어왔을 때의 화면. 없으면 Next 기본 404(영문)가 뜬다.
 */
export default function NotFound() {
  return (
    <main className="hc-page-app flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-[420px] text-center">
        <p className="font-mono text-[11px] tracking-[1.2px] text-[color:var(--hc-muted)]">
          404
        </p>
        <h1 className="mt-3 text-[24px] font-extrabold tracking-[-0.6px] text-[color:var(--hc-text)]">
          없는 페이지예요
        </h1>
        <p className="mt-3 text-[15px] leading-[1.75] text-[color:var(--hc-muted)]">
          주소가 바뀌었거나 지워진 화면일 수 있어요.
        </p>

        <div className="mt-7 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="hc-button-primary w-full rounded-full px-5 py-3 text-[16px] font-extrabold sm:w-auto"
          >
            홈으로
          </Link>
          <Link
            href="/shoot"
            className="w-full rounded-full border border-[color:var(--hc-border)] px-5 py-3 text-[16px] font-semibold text-[color:var(--hc-text)] transition hover:border-[color:var(--hc-border-strong)] sm:w-auto"
          >
            촬영하러 가기
          </Link>
        </div>
      </div>
    </main>
  );
}
