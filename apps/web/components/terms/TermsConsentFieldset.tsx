"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { TermsFullText } from "./TermsFullText";
import type { ConsentChoice } from "@/hooks/useActiveTerms";
import { Sentences } from "@/components/ui/Sentences";

type Props = {
  items: ConsentChoice[];
  checked: Record<string, boolean>;
  onToggle: (code: string, next: boolean) => void;
  error?: string | null;
  disabled?: boolean;
};

/**
 * 약관 동의 체크박스 묶음(가입 화면).
 *
 * 우리 약관 화면이 있는 코드는 그 페이지로 보내고, 없는 코드(관리자가 새로 만든 약관)는
 * 서버가 준 본문을 그 자리에서 펼쳐 준다. **읽을 수 없는 항목에 동의를 받지 않는다.**
 *
 * 맨 위 「전체 동의」는 한 번에 모두 체크하고 모두 푼다(2026-11-14). 국내 가입 화면의 흔한 모양이고,
 * 아래 항목은 하나씩 그대로 고를 수 있어 선택 약관을 억지로 받지 않는다.
 *
 * 빠진 필수 약관은 그 체크칸 테두리와 [필수] 표시를 빨갛게 하고, 묶음 바로 아래에 한 줄로 말한다.
 * 한때는 줄 전체를 분홍으로 칠하고 체크박스 둘레에 네모 테두리를 둘렀으며 문장은 화면 읽기
 * 프로그램에만 읽혔다 — 무엇을 해야 하는지 화면에 글자로 없었다.
 */
export function TermsConsentFieldset({
  items,
  checked,
  onToggle,
  error,
  disabled,
}: Props) {
  const errorId = useId();
  const allChecked = items.length > 0 && items.every((item) => checked[item.code]);
  const showError = Boolean(error) && items.some((item) => item.required && !checked[item.code]);

  return (
    <div className="flex flex-col gap-2">
      <fieldset className="flex flex-col gap-0 rounded-xl border border-(--hc-border) bg-(--hc-surface-muted) px-3 py-1">
        <legend className="sr-only">약관 동의</legend>
        <label className="flex min-h-12 items-center gap-3 border-b border-(--hc-border) py-2 text-[14px] font-bold text-(--hc-text)">
          <input
            type="checkbox"
            checked={allChecked}
            disabled={disabled}
            onChange={(e) => {
              for (const item of items) onToggle(item.code, e.target.checked);
            }}
            className="hc-checkbox"
          />
          전체 동의
        </label>
        {items.map((item) => {
          const missing = showError && item.required && !checked[item.code];
          return (
            <div key={item.code} className="flex flex-col gap-1">
              {/*
                한 줄이 44px 다. 예전에는 16px 체크박스·17px 줄·11px '보기' 가 26px 간격으로 붙어
                손가락으로 고르기 어려웠다. 전문 아이콘은 label 안에 있으면 어느 쪽을 누른 건지 애매해서
                형제로 뺀다 — label 은 체크박스만, 오른쪽 끝 아이콘은 약관 전문만 연다(TermsFullText).
              */}
              <TermsFullText title={item.title} content={item.href ? null : item.content}>
                {(fullTextToggle) => (
                  <div className="flex min-h-11 items-center gap-2">
                    <label className="flex min-w-0 flex-1 items-center gap-3 py-2 text-[13px] text-(--hc-text)">
                      <input
                        type="checkbox"
                        checked={checked[item.code] ?? false}
                        disabled={disabled}
                        aria-invalid={missing}
                        aria-describedby={missing ? errorId : undefined}
                        onChange={(e) => onToggle(item.code, e.target.checked)}
                        className="hc-checkbox"
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
      </fieldset>
      {/* 다 체크하면 테두리와 함께 거둔다. 제출하면 첫 빈 필수 체크칸으로 포커스가 간다(가입 화면 showErrors). */}
      {showError ? (
        <p id={errorId} role="alert" className="px-1 text-[12px] font-semibold text-(--hc-danger)">
          <Sentences text={error} />
        </p>
      ) : null}
    </div>
  );
}
