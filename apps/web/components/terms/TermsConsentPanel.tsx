"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /**
   * 지금 서버로 나가 있는 약관 코드들. **항목별로 센다.**
   *
   * 잠금이 코드 하나였을 때는 두 번째 항목을 누르는 순간 첫 항목이 다시 열렸다. 첫
   * 항목을 한 번 더 누르면 같은 약관에 동의와 철회가 나란히 날아가, 장부에 남는 값을
   * 사용자의 마지막 선택이 아니라 응답 도착 순서가 정했다. 먼저 끝난 요청이 아직 나가
   * 있는 다른 요청의 잠금까지 풀어 버리는 것도 같은 뿌리다.
   *
   * `ref` 가 잠금의 원본이고 `state` 는 화면에 비추는 사본이다. 한 렌더 안에서 두 번
   * 눌리면 상태 값은 아직 갱신 전이라 같은 코드를 두 번 통과시킨다.
   */
  const pendingCodesRef = useRef<ReadonlySet<string>>(new Set<string>());
  const [pendingCodes, setPendingCodes] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
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
      const fresh = await fetchMyTermsConsents();
      setConsents((current) =>
        fresh.map((consent) => {
          // 아직 나가 있는 항목은 결과가 정해지지 않았다. 화면에 미리 그린 값을 그대로
          // 둔다 — 서버 값으로 덮으면 남의 요청 실패가 내 체크박스를 되돌린다.
          if (!pendingCodesRef.current.has(consent.code)) return consent;
          return current?.find((item) => item.code === consent.code) ?? consent;
        }),
      );
    } catch {
      // **최초 조회 실패와 재조회 실패는 다르다.**
      //
      // 최초 조회는 아직 보여 줄 것이 없으니 빈 목록과 조회 오류가 맞다. 반면 변경
      // 실패 뒤의 재조회는 이미 화면에 목록이 있다 — 여기서 비우면 체크박스가 전부
      // 사라져, 연결이 돌아와도 같은 화면에서 동의·철회를 다시 누를 자리가 없다.
      // 사용자에게 실제로 필요한 저장 실패 문구도 조회 오류로 덮이므로 둘 다 남긴다.
      setConsents((current) => current ?? []);
      setError((current) => current ?? "약관 동의 정보를 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    // 비동기 IIFE 로 감싼다 — 이펙트 본문에서 곧바로 setState 하는 모양이면
    // react-hooks/set-state-in-effect 가 잡는다(연쇄 렌더 방지 규칙).
    void (async () => {
      await load();
    })();
  }, [load]);

  /** 잠금은 항목별로 넣고 뺀다. 통째로 비우면 아직 나가 있는 다른 항목까지 열린다. */
  const markPending = (code: string, pending: boolean) => {
    const nextCodes = new Set(pendingCodesRef.current);
    if (pending) nextCodes.add(code);
    else nextCodes.delete(code);
    pendingCodesRef.current = nextCodes;
    setPendingCodes(nextCodes);
  };

  const toggle = async (item: MyTermsConsent, next: boolean) => {
    // 읽을 수단이 없으면 동의를 기록하지 않는다. 체크박스도 잠겨 있지만, 장부에 남기는
    // 자리에서 한 번 더 막는다 — 여기서 새는 값은 되돌릴 수 없다.
    //
    // 막는 것은 주는 방향(`next`)뿐이다. 거두는 방향까지 막으면 체크박스는 눌리는데
    // 아무 일도 안 일어나는 무반응이 된다 — 잠긴 것보다 헷갈리고, 철회는 본문 없이도
    // 언제나 할 수 있어야 한다.
    if (next && isUnreadable(item.code)) return;
    // 같은 약관이 이미 나가 있으면 두 번 보내지 않는다. 동의와 철회가 나란히 날아가면
    // 장부는 화면의 마지막 선택과 반대로 굳을 수 있다.
    if (pendingCodesRef.current.has(item.code)) return;
    markPending(item.code, true);
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
      markPending(item.code, false);
    } catch (err) {
      console.error(err);
      setError(
        getUserFacingApiErrorMessage(err, "동의 설정을 저장하지 못했어요."),
      );
      // 되돌리기 전에 내 잠금부터 푼다. 그래야 `load()` 가 이 항목만 서버 값으로
      // 되돌리고, 아직 나가 있는 다른 항목의 화면 값은 건드리지 않는다.
      markPending(item.code, false);
      // 미리 그린 값은 여기서 먼저 눌리기 전으로 되돌린다. 아래 `load()` 가 성공하면
      // 서버 값으로 다시 덮이지만, 그 조회까지 실패하면 저장되지 않은 값만 화면에
      // 남는다 — 저장 실패 문구를 보면서 체크는 들어가 있는 꼴이라, 같은 동작을
      // 재시도하려면 반대 방향을 눌러야 하는 화면이 된다.
      setConsents((current) =>
        (current ?? []).map((consent) =>
          consent.code === item.code
            ? {
                ...consent,
                status: item.status,
                agreedVersion: item.agreedVersion,
              }
            : consent,
        ),
      );
      await load();
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
                    // 본문을 못 읽는 약관은 새 동의만 막는다 — 이미 한 동의를 거두는 것은
                    // 본문 없이도 언제나 할 수 있어야 한다.
                    disabled={
                      item.required ||
                      pendingCodes.has(item.code) ||
                      (isUnreadable(item.code) && !agreed)
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
