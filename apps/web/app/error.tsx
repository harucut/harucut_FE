"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * 렌더 중 예외가 났을 때의 화면.
 *
 * 없으면 Next 기본 오류 화면이 뜬다 — 영문이고, 우리 디자인이 아니고, 사용자가 할 수 있는
 * 일도 알려주지 않는다. 작업물이 날아간 상황일 수 있으니 문구는 사실만 말하고
 * 되돌릴 방법을 준다.
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="hc-page-app flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-[420px] text-center">
        <p className="font-mono text-[11px] tracking-[1.2px] text-[color:var(--hc-muted)]">
          ERROR
        </p>
        <h1 className="mt-3 text-[24px] font-extrabold tracking-[-0.6px] text-[color:var(--hc-text)]">
          화면을 여는 데 실패했어요
        </h1>
        <p className="mt-3 text-[15.5px] leading-[1.75] text-[color:var(--hc-muted)]">
          잠시 후 다시 시도해 보세요. 계속 같은 화면이 나오면 홈으로 돌아간 뒤
          다시 들어와 주세요.
        </p>

        <div className="mt-7 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="hc-button-primary w-full rounded-full px-5 py-3 text-[16px] font-extrabold sm:w-auto"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="w-full rounded-full border border-[color:var(--hc-border)] px-5 py-3 text-[16px] font-semibold text-[color:var(--hc-text)] transition hover:border-[color:var(--hc-border-strong)] sm:w-auto"
          >
            홈으로
          </Link>
        </div>

        {/* digest 는 서버 로그와 대조할 수 있는 유일한 단서라 화면에 남긴다. */}
        {error.digest ? (
          <p className="mt-6 font-mono text-[11px] text-[color:var(--hc-muted-soft)]">
            오류 코드 {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
