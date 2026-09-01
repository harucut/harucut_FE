"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTermsContent } from "@/components/terms/TermsReconsentDialog";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  fetchMyTermsConsents,
  submitTermsConsents,
  termsContentHref,
  type MyTermsConsent,
} from "@/lib/termsApi";

/**
 * 내 약관 동의 현황과 **선택 약관 철회** 수단.
 *
 * 마케팅 수신은 언제든 거둘 수 있어야 하는데(정보통신망법 §50), 그동안 우리 화면에는
 * 거둘 자리가 없었다 — 애초에 동의를 서버에 보내지도 않았다.
 *
 * 필수 약관은 **철회할 수 없다**(TERMS-003). 서버는 그 사실만 알려 주고 사용자가 무엇을
 * 해야 하는지는 말해 주지 않으므로, 여기서 탈퇴로 안내한다.
 *
 * **읽을 수 없는 항목에 동의를 받지 않는다.** 가입·재동의 화면과 같은 규칙이다 —
 * 여기 체크박스는 누르는 즉시 서버 장부에 기록되므로 더 그렇다.
 */
export function TermsConsentPanel() {
  const [consents, setConsents] = useState<MyTermsConsent[] | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 동의 기록(`MyTermsConsent`)에는 본문이 없다. 활성 약관 목록에서 따로 받아 온다.
  const { contentByCode, state: contentState } = useTermsContent();

  /**
   * 읽을 수단이 아직 없는 약관인가.
   *
   * 정적 링크도 없고 본문도 못 받았으면 사용자는 **제목만 보고 동의**하게 된다.
   * 그 동의는 받지 않는다 — 체크를 막고 왜 막혔는지 말한다.
   */
  const isUnreadable = (code: string) =>
    termsContentHref(code) === null && !contentByCode[code];

  const load = useCallback(async () => {
    try {
      setConsents(await fetchMyTermsConsents());
    } catch {
      setConsents([]);
      setError("약관 동의 정보를 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    // 비동기 IIFE 로 감싼다 — 이펙트 본문에서 곧바로 setState 하는 모양이면
    // react-hooks/set-state-in-effect 가 잡는다(연쇄 렌더 방지 규칙).
    void (async () => {
      await load();
    })();
  }, [load]);

  const toggle = async (item: MyTermsConsent, next: boolean) => {
    // 읽을 수단이 없으면 동의를 기록하지 않는다. 체크박스도 잠겨 있지만, 장부에 남기는
    // 자리에서 한 번 더 막는다 — 여기서 새는 값은 되돌릴 수 없다.
    if (isUnreadable(item.code)) return;
    setPendingCode(item.code);
    setError(null);
    // 응답을 기다리는 동안 화면부터 바꾼다. 실패하면 서버 값으로 되돌린다 —
    // 체크박스가 눌리지 않는 것처럼 보이면 사용자는 계속 다시 누른다.
    setConsents((current) =>
      (current ?? []).map((consent) =>
        consent.code === item.code
          ? {
              ...consent,
              status: next ? "AGREED" : "NOT_AGREED",
              agreedVersion: next ? consent.latestVersion : undefined,
            }
          : consent,
      ),
    );

    try {
      await submitTermsConsents([{ code: item.code, agreed: next }]);
    } catch (err) {
      console.error(err);
      setError(
        getUserFacingApiErrorMessage(err, "동의 설정을 저장하지 못했어요."),
      );
      await load();
    } finally {
      setPendingCode(null);
    }
  };

  if (consents === null) {
    return (
      <p className="text-[13px] leading-6 text-[color:var(--hc-muted)]">
        약관 동의 정보를 불러오는 중이에요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {consents.length === 0 ? (
        <p className="text-[13px] leading-6 text-[color:var(--hc-muted)]">
          {error ?? "표시할 약관이 없어요."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {consents.map((item) => {
            const href = termsContentHref(item.code);
            const agreed = item.status === "AGREED";
            return (
              <div key={item.code} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-[13px]">
                  <input
                    type="checkbox"
                    checked={agreed}
                    // 필수 약관은 서버가 철회를 거부한다. 눌리는 척하지 않는다.
                    disabled={
                      item.required ||
                      pendingCode === item.code ||
                      isUnreadable(item.code)
                    }
                    onChange={(e) => void toggle(item, e.target.checked)}
                    className="h-4 w-4 accent-[color:var(--hc-primary)] disabled:opacity-50"
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
                    {item.status === "NEEDS_RECONSENT" ? (
                      <span className="ml-1 text-[11px] text-[color:var(--hc-danger)]">
                        개정됨 · 재동의 필요
                      </span>
                    ) : null}
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
                </div>
                {/* 읽을 수단이 없으면 왜 동의할 수 없는지 말한다. */}
                {isUnreadable(item.code) ? (
                  <p className="ml-6 text-[11px] text-[color:var(--hc-muted)]">
                    {contentState === "loading"
                      ? "약관 본문을 불러오는 중이에요."
                      : "약관 본문을 불러오지 못했어요. 잠시 후 새로고침해 주세요."}
                  </p>
                ) : null}
                {/* 정적 링크가 없는 약관은 서버가 준 전문을 그 자리에서 펼친다. */}
                {!href && contentByCode[item.code] ? (
                  <details className="ml-6">
                    <summary className="cursor-pointer text-[11px] text-zinc-500 underline underline-offset-4">
                      전문 보기
                    </summary>
                    <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950/60 p-2 text-[11px] leading-5 text-zinc-400">
                      {contentByCode[item.code]}
                    </p>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {error && consents.length > 0 ? (
        <p className="text-[12px] text-[color:var(--hc-danger)]">{error}</p>
      ) : null}

      <p className="text-[12px] leading-5 text-[color:var(--hc-muted)]">
        필수 약관은 서비스 이용에 반드시 필요해 철회할 수 없어요. 동의를 거두시려면
        아래 회원 탈퇴를 이용해 주세요.
      </p>
      <p className="text-[13px] leading-5 text-[color:var(--hc-muted)]">
        푸시·주간 리마인더 알림은 순차적으로 추가될 예정이에요.
      </p>
    </div>
  );
}
