"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import { isProtectedPath } from "@/lib/protectedPaths";
import {
  clearPendingTermsConsent,
  getPendingTermsConsent,
  isSameConsentAccount,
} from "@/lib/pendingTermsConsent";
import { getMyUserInfo } from "@/lib/userApi";
import {
  fetchMyTermsConsents,
  pendingRequiredConsents,
  submitTermsConsents,
  termsContentHref,
  type MyTermsConsent,
} from "@/lib/termsApi";
import { getApiErrorDetails } from "@/lib/apiError";
import { TermsReconsentDialog } from "@/components/terms/TermsReconsentDialog";

/**
 * 약관 동의를 서버 장부에 맞춘다. 두 가지 일을 한다.
 *
 *  1. **가입 화면에서 받은 동의를 기록한다.** 동의 API 는 인증이 필요해 가입 시점엔 부를 수
 *     없어서, 고른 값을 보관해 두고 로그인 뒤 여기서 보낸다.
 *  2. **필수 약관에 동의가 없으면 붙잡는다.** 약관이 개정됐거나(`NEEDS_RECONSENT`),
 *     소셜 로그인처럼 동의 화면을 거치지 않고 계정이 생긴 경우(`NOT_AGREED`)다.
 *
 * 서버는 재동의를 강제하지 않는다 — 재동의 없이도 다른 API 는 전부 정상 동작한다.
 * 언제 막을지는 프론트가 정하므로, 여기서 정한다: **보호 화면에서만** 막는다.
 * 랜딩·요금제·약관 화면까지 막으면 "무엇에 동의하는지" 읽으러 갈 수조차 없다.
 *
 * 실패하면 아무것도 하지 않는다. 약관 조회가 흔들릴 때마다 앱 전체가 모달로 잠기는 것이
 * 동의를 하루 늦게 받는 것보다 나쁘다.
 */
export function TermsConsentBridge() {
  const pathname = usePathname();
  const [pending, setPending] = useState<MyTermsConsent[] | null>(null);
  const [all, setAll] = useState<MyTermsConsent[]>([]);
  // 한 번 확인했으면 화면을 옮겨 다닐 때마다 다시 묻지 않는다.
  const checkedRef = useRef(false);
  // 세션 조회가 끝나기 전에 화면을 옮기면 이펙트가 한 번 더 돈다. 그대로 두면 보관해 둔
  // 동의를 **두 번** 보내게 되는데, 동의 이력은 법적 증빙용이라 수정·삭제되지 않는다 —
  // 같은 동의가 두 줄로 남는다.
  const runningRef = useRef(false);

  const runCheck = useCallback(async () => {
    // 로그인했는지는 쿠키가 아니라 서버에 묻는다(만료된 쿠키가 남아 있을 수 있다).
    let authenticated = false;
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      authenticated = Boolean(
        ((await res.json()) as { authenticated?: boolean }).authenticated,
      );
    } catch {
      return;
    }
    if (!authenticated) return;

    // 여기서부터는 한 번만 돈다. 아래 조회가 실패해도 다시 시도하지 않는다 —
    // 화면을 옮길 때마다 같은 요청을 반복하는 편이 더 나쁘다.
    checkedRef.current = true;

    const stashed = getPendingTermsConsent();
    if (stashed) {
      // 보관물은 **가입한 그 계정** 것이다. "로그인했다"만 보고 보내면, 한 기기에서
      // 가입하고 다른 계정으로 로그인한 순간 고른 적 없는 사람의 장부에 붙는다.
      // 동의 이력은 법적 증빙용이라 수정·삭제되지 않아 되돌릴 방법이 없다 —
      // 특히 선택 약관(마케팅)은 수신 동의도 철회도 그대로 남는다. 그래서 대조한다.
      let accountEmail: string | null = null;
      try {
        accountEmail = (await getMyUserInfo()).email;
      } catch {
        // 내 정보 조회가 흔들린 것뿐이면 보관물을 버릴 이유가 없다. 이번 회차만 건너뛴다.
      }

      if (accountEmail && !isSameConsentAccount(accountEmail, stashed.email)) {
        // 주인이 아닌 계정이다. 남겨 둬도 주인이 이 기기로 돌아온다는 보장이 없다.
        clearPendingTermsConsent();
      } else if (accountEmail) {
        try {
          await submitTermsConsents(stashed.items);
          clearPendingTermsConsent();
        } catch (error) {
          // 다시 보내도 결과가 같은 실패면 버린다. 안 그러면 로그인할 때마다 같은 요청이
          // 나가고 매번 같은 이유로 실패한다. 남겨 두는 건 네트워크·인증 문제일 때뿐이다.
          const { code } = getApiErrorDetails(error);
          if (
            code === "TERMS-001" ||
            code === "TERMS-003" ||
            code === "GEN-002" ||
            code === "GEN-006"
          ) {
            clearPendingTermsConsent();
          }
        }
      }
    }

    try {
      const consents = await fetchMyTermsConsents();
      const required = pendingRequiredConsents(consents);
      if (required.length > 0) {
        setAll(consents);
        setPending(required);
      }
    } catch {
      // 조용히 넘어간다.
    }
  }, []);

  useEffect(() => {
    if (DEV_AUTH_BYPASS) return;
    if (checkedRef.current || runningRef.current) return;
    if (!isProtectedPath(pathname)) return;
    runningRef.current = true;
    void (async () => {
      try {
        await runCheck();
      } finally {
        runningRef.current = false;
      }
    })();
  }, [pathname, runCheck]);

  if (!pending || pending.length === 0) return null;

  return (
    <TermsReconsentDialog
      consents={all}
      onDone={() => setPending(null)}
      contentHref={termsContentHref}
    />
  );
}
