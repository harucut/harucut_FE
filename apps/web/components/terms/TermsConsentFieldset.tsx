"use client";

import Link from "next/link";
import type { ConsentChoice } from "@/hooks/useActiveTerms";

type Props = {
  items: ConsentChoice[];
  checked: Record<string, boolean>;
  onToggle: (code: string, next: boolean) => void;
  error?: string | null;
  disabled?: boolean;
};

/**
 * 약관 동의 체크박스 묶음. 가입 화면과 재동의 화면이 같은 것을 쓴다.
 *
 * 두 화면이 갈리면 한쪽에만 새 약관이 뜨거나, 한쪽만 [필수] 표시가 빠진다 —
 * 동의 화면에서 그런 불일치는 그대로 법적 흠결이 된다.
 *
 * 우리 약관 화면이 있는 코드는 그 페이지로 보내고, 없는 코드(관리자가 새로 만든 약관)는
 * 서버가 준 본문을 그 자리에서 펼쳐 준다. **읽을 수 없는 항목에 동의를 받지 않는다.**
 */
export function TermsConsentFieldset({
  items,
  checked,
  onToggle,
  error,
  disabled,
}: Props) {
  return (
    <fieldset className="flex flex-col gap-0 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-1">
      <legend className="sr-only">약관 동의</legend>
      {items.map((item) => (
        <div key={item.code} className="flex flex-col gap-1">
          {/*
            한 줄이 44px 다. 예전에는 16px 체크박스·17px 줄·11px '보기' 가 26px 간격으로 붙어
            손가락으로 고르기 어려웠다. '보기' 는 label 안에 있으면 어느 쪽을 누른 건지 애매해서
            형제로 뺀다 — label 은 체크박스만, 링크는 약관만 연다.
          */}
          <div className="flex min-h-11 items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-3 py-2 text-[13px] text-zinc-300">
              <input
                type="checkbox"
                checked={checked[item.code] ?? false}
                disabled={disabled}
                onChange={(e) => onToggle(item.code, e.target.checked)}
                className="h-5 w-5 shrink-0 accent-(--hc-primary)"
              />
              <span>
                <span
                  className={
                    item.required
                      ? "text-(--hc-primary-strong)"
                      : "text-(--hc-muted)"
                  }
                >
                  {item.required ? "[필수]" : "[선택]"}
                </span>{" "}
                {item.title}
              </span>
            </label>
            {item.href ? (
              <Link
                href={item.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${item.title} 전문 보기`}
                className="inline-flex min-h-11 shrink-0 items-center px-2 text-[12px] text-(--hc-muted) underline underline-offset-4 hover:text-(--hc-text)"
              >
                보기
              </Link>
            ) : null}
          </div>
          {item.content ? (
            <details className="ml-6">
              <summary className="cursor-pointer text-[11px] text-zinc-500 underline underline-offset-4">
                전문 보기
              </summary>
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950/60 p-2 text-[11px] leading-5 text-zinc-400">
                {item.content}
              </p>
            </details>
          ) : null}
        </div>
      ))}
      {error ? (
        <p role="alert" className="pb-2 text-[12px] text-(--hc-danger)">{error}</p>
      ) : null}
    </fieldset>
  );
}
