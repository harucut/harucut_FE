"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { clientApi } from "@/lib/clientApi";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { submitTermsConsents, type MyTermsConsent } from "@/lib/termsApi";

type Props = {
  consents: MyTermsConsent[];
  onDone: () => void;
  contentHref: (code: string) => string | null;
};

/**
 * 필수 약관에 동의가 없을 때 붙잡는 화면.
 *
 * 두 경우에 뜬다 — 약관이 개정됐거나(`NEEDS_RECONSENT`), 동의 화면을 거치지 않고 계정이
 * 생겼거나(소셜 로그인 → `NOT_AGREED`).
 *
 * 세 가지를 지킨다.
 *  - **미리 체크해 두지 않는다.** 동의는 사용자가 직접 눌러야 성립한다. 개정 전 버전에
 *    동의했다는 사실은 새 버전에 대한 동의가 아니다.
 *  - **선택 약관의 기존 값은 지운 적 없이 그대로 둔다.** 이 화면을 필수 약관 때문에 띄웠는데
 *    마케팅 수신 동의가 조용히 철회되면 안 된다.
 *  - **닫을 수 없다.** 대신 로그아웃으로 나갈 길을 준다. 필수 약관은 철회가 불가능하고
 *    (TERMS-003) 정책상 탈퇴로만 가능하므로, 동의하지 않겠다면 계정을 쓰지 않는 것이 맞다.
 */
export function TermsReconsentDialog({ consents, onDone, contentHref }: Props) {
  const required = useMemo(
    () => consents.filter((item) => item.required && item.status !== "AGREED"),
    [consents],
  );
  const optional = useMemo(
    () => consents.filter((item) => !item.required),
    [consents],
  );

  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    // 선택 약관만 지금 값으로 채운다. 필수는 빈 칸에서 시작한다.
    Object.fromEntries(
      optional.map((item) => [item.code, item.status === "AGREED"]),
    ),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 닫을 수 없는 다이얼로그다. 훅에는 포커스 이동·트랩만 맡기고 Esc 는 흘려보낸다.
  const dialogRef = useModalDialog(true, () => undefined);

  const allRequiredChecked = required.every((item) => checked[item.code]);
  const revised = required.some((item) => item.status === "NEEDS_RECONSENT");

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // 화면에 보인 항목만 보낸다. 여기 없는 약관을 끼워 넣으면 사용자가 고르지 않은 값이
      // 장부에 남는다. 전부 아니면 전무라 한 번에 보낸다.
      await submitTermsConsents([
        ...required.map((item) => ({ code: item.code, agreed: true })),
        ...optional.map((item) => ({
          code: item.code,
          agreed: Boolean(checked[item.code]),
        })),
      ]);
      onDone();
    } catch (err) {
      console.error(err);
      setError(
        getUserFacingApiErrorMessage(
          err,
          "동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await clientApi.delete("/api/client/logout").catch(() => undefined);
    window.location.href = "/login";
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-[rgba(10,24,45,0.6)] px-4 py-6 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-reconsent-title"
        className="hc-surface-card w-full max-w-md rounded-3xl border p-6 shadow-[var(--hc-card-shadow)]"
      >
        <span className="hc-accent-chip inline-flex h-12 w-12 items-center justify-center rounded-3xl border">
          <FileText className="h-5 w-5" />
        </span>
        <h2
          id="terms-reconsent-title"
          className="mt-4 text-[18px] font-extrabold"
        >
          {revised ? "약관이 개정되었어요" : "약관 동의가 필요해요"}
        </h2>
        <p className="mt-1.5 text-[13px] leading-6 text-[color:var(--hc-muted)]">
          {revised
            ? "계속 이용하시려면 개정된 약관에 다시 동의해 주세요."
            : "서비스를 이용하려면 아래 약관에 동의해 주세요."}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {[...required, ...optional].map((item) => {
            const href = contentHref(item.code);
            return (
              <label
                key={item.code}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-[13px]"
              >
                <input
                  type="checkbox"
                  checked={checked[item.code] ?? false}
                  disabled={isSubmitting}
                  onChange={(e) =>
                    setChecked((current) => ({
                      ...current,
                      [item.code]: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-[color:var(--hc-primary)]"
                />
                <span>
                  <span
                    className={
                      item.required
                        ? "text-[color:var(--hc-primary-strong)]"
                        : "text-zinc-500"
                    }
                  >
                    {item.required ? "[필수]" : "[선택]"}
                  </span>{" "}
                  {item.title}
                </span>
                {href ? (
                  <Link
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto shrink-0 text-[11px] text-zinc-500 underline underline-offset-4"
                  >
                    보기
                  </Link>
                ) : null}
              </label>
            );
          })}
        </div>

        {error ? (
          <p className="mt-3 text-[12px] text-[color:var(--hc-danger)]">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allRequiredChecked || isSubmitting}
            className="hc-button-primary inline-flex h-12 items-center justify-center rounded-full text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? "저장 중..." : "동의하고 계속하기"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isSubmitting}
            className="h-10 text-[13px] text-[color:var(--hc-muted)] underline underline-offset-4 disabled:opacity-40"
          >
            동의하지 않고 로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
