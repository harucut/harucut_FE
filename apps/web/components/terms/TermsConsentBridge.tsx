"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { resolveMembership } from "@/lib/authSession";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import { isProtectedPath } from "@/lib/protectedPaths";
import {
  clearPendingTermsConsentIfUnchanged,
  getPendingTermsConsent,
  isSameConsentAccount,
  type PendingTermsConsent,
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
  const [retryNeeded, setRetryNeeded] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const autoRetriedRef = useRef(false);
  // POST는 응답을 못 받아도 서버에 기록됐을 수 있다. 조회 재시도와 분리해 한 번만 보낸다.
  const handoffAttemptedRef = useRef(false);
  // 세션 조회가 끝나기 전에 화면을 옮기면 이펙트가 한 번 더 돈다. 그대로 두면 보관해 둔
  // 동의를 **두 번** 보내게 되는데, 동의 이력은 법적 증빙용이라 수정·삭제되지 않는다 —
  // 같은 동의가 두 줄로 남는다.
  const runningRef = useRef(false);
  // 이번 회차에 **내가 읽은** 보관물. 재동의 화면을 통과했을 때 지울 대상을 이것으로
  // 못 박는다 — 아래 `onDone` 주석 참고.
  const stashedRef = useRef<PendingTermsConsent | null>(null);

  const runCheck = useCallback(async () => {
    /*
      로그인했는지는 쿠키가 아니라 서버에 묻는다(만료된 쿠키가 남아 있을 수 있다).

      묻는 것은 `resolveMembership()` 이다 — 생 `/api/auth/session` 이 아니다. 그 라우트는
      만료된 access 를 **재발급해 주지 않고** 백엔드의 401 을 `authenticated: false` 로
      감싸므로, access 만 만료되고 refresh 는 멀쩡한 회원이 비회원으로 읽힌다. 그러면 아래
      필수 약관 재동의 검사가 통째로 건너뛰어진다. 재시도 역시 재발급 가능한 판정을 써야
      같은 회원을 비회원으로 반복 판정하지 않는다.

      회원이 아니면(확정된 비회원이든 못 물어본 `unknown` 이든) 그냥 돌아간다. 아래 한 번만
      도는 표식(`checkedRef`)은 **약관 조회가 성공한 뒤에 세우므로** 이 회차는 그것을 쓰지
      않는다 — 다음 회차에 다시 묻는다.
    */
    const membership = await resolveMembership();
    if (membership !== "member") return membership === "unknown";

    const stashed = handoffAttemptedRef.current ? null : getPendingTermsConsent();
    if (!handoffAttemptedRef.current) stashedRef.current = stashed;
    if (stashed) {
      // 보관물은 **가입한 그 계정** 것이다. "로그인했다"만 보고 보내면, 한 기기에서
      // 가입하고 다른 계정으로 로그인한 순간 고른 적 없는 사람의 장부에 붙는다.
      // 동의 이력은 법적 증빙용이라 수정·삭제되지 않아 되돌릴 방법이 없다 —
      // 특히 선택 약관(마케팅)은 수신 동의도 철회도 그대로 남는다. 그래서 대조한다.
      let accountEmail: string | null = null;
      try {
        accountEmail = (await getMyUserInfo()).email;
      } catch {
        // 내 정보 조회가 흔들린 것뿐이면 보관물을 버릴 이유가 없다. 이번 회차만 건너뛴다
        // (남은 보관물은 아래 재동의 화면을 통과하면 그때 지운다).
      }

      /*
        여기서 지울 때도 **읽어 둔 그 보관물일 때만** 지운다. 위 `getMyUserInfo` 와 아래
        `submitTermsConsents` 는 네트워크 왕복이라, 그 사이에 다른 탭에서 가입이 끝나면
        같은 origin 의 키가 새 계정 동의로 바뀌어 있을 수 있다. 무조건 지우면 그 사람의
        아직 제출되지 않은 법적 동의가 사라진다.
        지운 뒤 `stashedRef` 를 비워 「stashedRef 는 아직 안 지운 보관물」을 참으로 둔다.
      */
      const dropStashed = () => {
        clearPendingTermsConsentIfUnchanged(stashed);
        stashedRef.current = null;
      };

      if (accountEmail && !isSameConsentAccount(accountEmail, stashed.email)) {
        // 주인이 아닌 계정이다. 남겨 둬도 주인이 이 기기로 돌아온다는 보장이 없다.
        dropStashed();
      } else if (accountEmail) {
        handoffAttemptedRef.current = true;
        try {
          await submitTermsConsents(stashed.items);
          dropStashed();
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
            dropStashed();
          }
        }
      }
    }

    try {
      const consents = await fetchMyTermsConsents();
      const required = pendingRequiredConsents(consents);
      checkedRef.current = true;
      if (required.length > 0) {
        setAll(consents);
        setPending(required);
      }
      return false;
    } catch {
      // 앱은 잠그지 않되, 실패를 확인 완료로 기억하지 않는다.
      return true;
    }
  }, []);

  useEffect(() => {
    if (DEV_AUTH_BYPASS) return;
    if (checkedRef.current || runningRef.current) return;
    if (!isProtectedPath(pathname)) return;
    runningRef.current = true;
    void (async () => {
      try {
        setRetryNeeded(await runCheck());
      } catch {
        setRetryNeeded(true);
      } finally {
        runningRef.current = false;
      }
    })();
  }, [pathname, retryNonce, runCheck]);

  useEffect(() => {
    if (!retryNeeded || autoRetriedRef.current || !isProtectedPath(pathname)) return;
    // 같은 화면에서도 일시 장애를 한 번 복구한다. 계속 실패하면 다음 화면 이동 때 묻는다.
    const timer = window.setTimeout(() => {
      autoRetriedRef.current = true;
      setRetryNonce((nonce) => nonce + 1);
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [pathname, retryNeeded]);

  /*
    **보호 화면에서만 막는다 — 결과를 버리지는 않는다.**

    검사는 보호 경로에서만 시작하지만, 회원 판정과 약관 조회에 왕복이 둘 붙어 그 사이
    사용자가 `/terms`·`/privacy` 같은 공개 화면으로 옮겨 갈 수 있다. 이 브리지는 루트
    레이아웃에 계속 마운트돼 있으므로, 늦게 온 결과로 모달을 띄우면 **약관 본문을 읽으러 간
    사람을 그 자리에서 막는다** — 이 파일이 세운 「읽을 수 있게 두고 보호 화면에서만 막는다」가
    정확히 뒤집힌다.

    그렇다고 그 회차의 결과를 버리지는 않는다. 버리면 `checkedRef` 가 이미 서 있어 다시
    묻지 않으므로, 검사 도중 공개 화면을 한 번 들르는 것만으로 필수 재동의를 영영 피할 수
    있다. 상태에는 남기고 **그리는 것만** 경로로 가른다 — 보호 화면으로 돌아오면 그때 뜬다.
  */
  if (!pending || pending.length === 0 || !isProtectedPath(pathname)) return null;

  return (
    <TermsReconsentDialog
      consents={all}
      onDone={() => {
        /*
          여기까지 왔다는 건 사용자가 이 화면에서 직접 고른 값이 서버에 저장됐다는 뜻이다
          (`onDone` 은 저장에 성공했을 때만 불린다). 그런데 위에서 내 정보 조회가 흔들려
          계정을 대조하지 못했으면 가입 때 보관물이 그대로 남아 있다 — 그대로 두면 다음
          새로고침에 그것이 다시 제출되어 **방금 고른 선택 약관 값이 가입 때 값으로
          되돌아간다.** 동의 이력은 수정·삭제되지 않아 되돌릴 방법이 없고, 필수 동의는
          같은 줄이 하나 더 남는다.

          약관 조회가 실패한 회차에는 이 화면 자체가 뜨지 않으므로, 아직 보내야 하는
          보관물을 여기서 버리는 일은 없다.

          다만 지우는 것은 **내가 위에서 읽은 그 보관물일 때만**이다. 보관 키는 같은
          origin 의 모든 탭이 함께 쓰는데, 이 화면은 사용자가 약관을 읽는 동안 몇 분씩
          열려 있다. 그 사이 다른 탭에서 새 가입이 끝나면 키에는 **그 사람의 아직 제출되지
          않은 동의**가 들어와 있고, 그대로 지우면 고른 적 있는 동의가 소리 없이 사라진다.
          localStorage 에 조건부 삭제는 없으니 이건 원자적이지 않다 — 창을 좁힐 뿐이다.
        */
        if (stashedRef.current) {
          clearPendingTermsConsentIfUnchanged(stashedRef.current);
        }
        setPending(null);
      }}
      contentHref={termsContentHref}
    />
  );
}
