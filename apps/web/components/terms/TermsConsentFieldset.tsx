"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { TermsFullText } from "./TermsFullText";
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
  const errorId = useId();
  return (
    <fieldset className="flex flex-col gap-0 rounded-xl border border-(--hc-border) bg-(--hc-surface-muted) px-3 py-1">
      <legend className="sr-only">약관 동의</legend>
      {items.map((item) => {
        const missing = Boolean(error && item.required && !checked[item.code]);
        return (
          <div key={item.code} className="flex flex-col gap-1">
            {/*
              한 줄이 44px 다. 예전에는 16px 체크박스·17px 줄·11px '보기' 가 26px 간격으로 붙어
              손가락으로 고르기 어려웠다. 전문 아이콘은 label 안에 있으면 어느 쪽을 누른 건지 애매해서
              형제로 뺀다 — label 은 체크박스만, 오른쪽 끝 아이콘은 약관 전문만 연다(TermsFullText).
            */}
            <TermsFullText title={item.title} content={item.href ? null : item.content}>
              {(fullTextToggle) => (
                <div className={`flex min-h-11 items-center gap-2 ${missing ? "-mx-2 rounded-lg bg-(--hc-danger-soft-bg) px-2" : ""}`}>
                  <label className={`flex min-w-0 flex-1 items-center gap-3 py-2 text-[13px] ${missing ? "text-(--hc-danger)" : "text-(--hc-text)"}`}>
                    <input
                      type="checkbox"
                      checked={checked[item.code] ?? false}
                      disabled={disabled}
                      aria-invalid={missing}
                      aria-describedby={missing ? errorId : undefined}
                      onChange={(e) => onToggle(item.code, e.target.checked)}
                      className={`h-5 w-5 shrink-0 accent-(--hc-primary) ${missing ? "rounded-sm outline-2 outline-offset-2 outline-(--hc-danger)" : ""}`}
                    />
                    <span>
                      <span
                        className={
                          missing
                            ? "text-(--hc-danger)"
                            : item.required
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
                      className="-my-3 -mr-2 ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full text-(--hc-muted) hover:text-(--hc-text)"
                    >
                      <ChevronRight aria-hidden className="h-4 w-4" />
                    </Link>
                  ) : (
                    fullTextToggle
                  )}
                </div>
              )}
            </TermsFullText>
          </div>
        );
      })}
      {/*
        빠진 필수 약관은 그 줄을 빨갛게 칠하고 체크박스에 테두리를 두른다(색만으로 알리지 않는다).
        문장은 화면에서 빼고 화면 읽기 프로그램에만 읽힌다 — 제출하면 첫 빈 체크박스로 포커스가 간다(가입 화면 showErrors).
        다 체크하면 줄 표시와 함께 문장도 거둔다.
      */}
      {error && items.some((item) => item.required && !checked[item.code]) ? (
        <p id={errorId} role="alert" className="sr-only">{error}</p>
      ) : null}
    </fieldset>
  );
}
