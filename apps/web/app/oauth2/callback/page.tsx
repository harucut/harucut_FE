"use client";

/*
  이 파일의 이동은 전부 **일부러 문서를 새로 받는다**(`window.location.href`).
  `useRouter().push` 는 클라이언트 전환이라 인증 경계에서 셋이 어긋난다.

  1. `proxy.ts` 의 보호 경로 판정은 문서 요청에서만 돈다 — 클라이언트 전환은 지나친다.
  2. zustand 스토어(게스트 체험 상태·세션 캐시)가 그대로 살아남는다. 소셜 로그인은
     "여기서부터 다른 사람"이 되는 지점이라 남아 있으면 안 된다.
  3. 서버 컴포넌트가 **예전 쿠키로 만든 RSC 캐시**를 다시 쓸 수 있다. 여기서 바뀌는 것이
     바로 그 쿠키다(탈퇴 취소 경로는 토큰의 status 까지 갈아 끼운다 — 아래 주석 참고).

  그래서 `@next/next/no-location-assign-relative-destination` 을 이 파일에서만 끈다.
  같은 이유로 로그인 성공(app/login/page.tsx)과 재동의 로그아웃도 같은 방식이다.
*/
/* eslint-disable @next/next/no-location-assign-relative-destination */

import { useEffect, useRef, useState } from "react";
import { COMPANY } from "@harucut/shared";
import { ApiRequestError, clientApi } from "@/lib/clientApi";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { reactivateAccount } from "@/lib/auth/authApi";
import { buildPathWithRedirect, resolveRedirectTarget } from "@/lib/redirect";
import { SOCIAL_LOGIN_FAILED_MESSAGE, startSocialLogin } from "@/lib/authLogin";
import {
  RESTRICTED_ACCOUNT_MESSAGE,
  isUnusableUserStatus,
  readUserStatus,
} from "@/lib/authUserStatus";
import {
  clearSocialLoginProvider,
  consumeSocialLoginRedirect,
  hasSocialLoginReactivated,
  markSocialLoginReactivated,
  readSocialLoginProvider,
} from "@/lib/socialLoginRedirect";

const CHECKING_MESSAGE = "소셜 로그인 상태를 확인하는 중이에요.";

/** 더 진행할 수 없는 끝. 다시 시도 대신 로그인으로 돌아갈 길(막힌 계정이면 문의처까지)만 남긴다. */
type DeadEnd = { loginHref: string; showSupport: boolean };

/**
 * 방금 받은 세션을 지워도 되는 실패인지.
 *
 * 상태 조회는 쿠키가 유효하면 200, 아니면 401 둘뿐이다(GET /api/auth/status).
 * 즉 401 은 서버가 이 자격증명을 거부한 것이고, 그 밖의 실패(네트워크 끊김·5xx·
 * 재발급이 일시적으로 안 돼 던지는 CLIENT-001=503)는 세션이 멀쩡한데 답만 못 받은
 * 것일 수 있다. 후자에서 로그아웃시키면 "일시 장애를 세션 만료로 단정하지 않는다"는
 * `lib/clientApi.ts` 의 규칙을 이 화면에서만 뒤집는 셈이 된다.
 * 403 은 지금 계약엔 없지만, 인가 거부가 오면 그것도 자격증명 거부로 본다.
 */
function isCredentialFailure(error: unknown) {
  return (
    error instanceof ApiRequestError &&
    (error.status === 401 || error.status === 403)
  );
}

export default function OAuthCallbackPage() {
  const [message, setMessage] = useState(CHECKING_MESSAGE);
  const [canRetry, setCanRetry] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [deadEnd, setDeadEnd] = useState<DeadEnd | null>(null);
  const isHandlingRef = useRef(false);
  // 돌아갈 곳은 세션 저장소에서 **한 번만** 꺼낼 수 있다(consume 이 읽으면서 지운다).
  // 다시 시도가 그 값을 잃으면 원래 가려던 화면 대신 늘 기본 경로로 떨어진다.
  const redirectTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (isHandlingRef.current) return;
    isHandlingRef.current = true;

    let cancelled = false;

    async function completeSocialLogin() {
      const redirectTarget =
        redirectTargetRef.current ??
        resolveRedirectTarget(consumeSocialLoginRedirect());
      redirectTargetRef.current = redirectTarget;

      // 제공자 화면에서 취소했거나 인가가 실패했다 — 백엔드는 실패도 이 콜백으로 보내고
      // `?error=` 만 붙인다. 새로 받은 세션이 없으니 물어볼 것도 지울 것도 없다.
      // 상태를 물으면 세션 없는 401 이 「일시적인 문제」나 「다시 로그인」으로 둔갑한다.
      if (new URLSearchParams(window.location.search).has("error")) {
        clearSocialLoginProvider();
        setMessage(SOCIAL_LOGIN_FAILED_MESSAGE);
        setDeadEnd({
          loginHref: buildPathWithRedirect("/login?socialError=1", redirectTarget),
          showSupport: false,
        });
        return;
      }

      try {
        const response = await clientApi.get<unknown>("/api/auth/status", {
          cache: "no-store",
        });

        if (cancelled) return;

        const userStatus = readUserStatus(response.data);
        if (userStatus === "DELETED_REQUESTED") {
          const shouldReactivate = window.confirm(
            "탈퇴 신청한 계정이에요. 재등록을 진행할까요?",
          );

          if (!shouldReactivate) {
            await clientApi.delete("/api/client/logout").catch(() => undefined);
            if (!cancelled) {
              window.location.href = "/login";
            }
            return;
          }

          setMessage("재등록을 처리하는 중이에요.");

          try {
            await reactivateAccount();
          } catch (reactivateError) {
            console.error(reactivateError);
            await clientApi.delete("/api/client/logout").catch(() => undefined);
            alert("재등록 처리에 실패했어요. 다시 시도해 주세요.");
            if (!cancelled) {
              window.location.href = "/login";
            }
            return;
          }

          // 복구는 됐지만 지금 쿠키로는 아무것도 못 한다 — 토큰에 status=DELETED_REQUESTED 가
          // 박혀 있고 reactivate 는 새 쿠키를 주지 않은 채 서버의 refresh 토큰까지 지운다.
          // 이메일 로그인과 달리 여기엔 다시 쓸 자격증명이 없으므로, 들어온 소셜 인가를
          // 한 번 더 태워 ACTIVE 토큰을 받는다. 계정은 이미 복구됐으니 이번엔 그대로 통과한다.
          // 근거: docs/backend-contract.md "탈퇴 요청 → 복구 생애주기"
          const provider = readSocialLoginProvider();
          if (cancelled) return;

          if (provider && !hasSocialLoginReactivated()) {
            setMessage("탈퇴를 취소했어요. 로그인을 마무리하는 중이에요.");
            markSocialLoginReactivated();
            // 소비해 버린 돌아갈 곳을 다시 심어야 두 번째 콜백이 같은 곳으로 보낸다.
            startSocialLogin(provider, redirectTarget);
            return;
          }

          // 제공자를 모르거나(세션 저장소가 비었을 때) 이미 한 번 다시 태웠는데도 여전히
          // 탈퇴요청이면, 더 왕복시키지 않고 사용자가 직접 로그인하게 한다.
          clearSocialLoginProvider();
          alert("탈퇴를 취소했어요. 다시 로그인해 주세요.");
          window.location.href = "/login";
          return;
        }

        // 차단·탈퇴 계정 — 상태 조회는 200 이어도 일반 API 는 전부 막힌다.
        // 들여보내면 아무것도 못 하는 홈에 갇히므로 받은 세션을 지우고 이유와 문의처를 말한다.
        if (isUnusableUserStatus(userStatus)) {
          await clientApi.delete("/api/client/logout").catch(() => undefined);
          clearSocialLoginProvider();
          if (cancelled) return;
          setMessage(RESTRICTED_ACCOUNT_MESSAGE);
          setDeadEnd({ loginHref: "/login", showSupport: true });
          return;
        }

        clearSocialLoginProvider();

        if (!cancelled) {
          window.location.href = redirectTarget;
        }
      } catch (error) {
        console.error(error);
        if (cancelled) return;

        if (isCredentialFailure(error)) {
          // 서버가 이 자격증명을 거부했다 — 이때만 쿠키를 정리하고 다시 로그인시킨다.
          await clientApi.delete("/api/client/logout").catch(() => undefined);
          clearSocialLoginProvider();
          alert("로그인하지 못했어요. 다시 로그인해 주세요.");
          if (!cancelled) {
            window.location.href = "/login";
          }
          return;
        }

        // 여기까지 온 실패는 방금 받은 세션이 멀쩡할 수 있다. 지우지 않고 사유를 말한 뒤
        // 다시 시도할 길을 준다 — 그냥 두면 화면은 계속 "확인하는 중"이라고 거짓말한다.
        setMessage(
          getUserFacingApiErrorMessage(
            error,
            "연결이 불안정해요. 잠시 후 다시 시도해 주세요.",
          ),
        );
        setCanRetry(true);
      }
    }

    void completeSocialLogin();

    return () => {
      cancelled = true;
      isHandlingRef.current = false;
    };
  }, [retryKey]);

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-(--hc-text)">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        {/* 끝난 자리에서 「처리 중」이면 본문과 반대 말이 되고, 제목으로 훑는 스크린리더에겐 아직 진행 중이다. */}
        <h1 className="text-base font-semibold">
          {deadEnd ? "로그인하지 못했어요" : "로그인 처리 중"}
        </h1>
        <p aria-live="polite" className="text-sm text-zinc-400">{message}</p>
        {deadEnd?.showSupport ? (
          <a
            href={`mailto:${COMPANY.email}`}
            className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-(--hc-primary-strong) underline underline-offset-4"
          >
            {COMPANY.email}
          </a>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            onClick={() => {
              setCanRetry(false);
              setMessage(CHECKING_MESSAGE);
              setRetryKey((prev) => prev + 1);
            }}
            className="hc-button-secondary self-start rounded-full border px-5 py-2 text-[13px] font-semibold"
          >
            다시 시도
          </button>
        ) : null}
        {/* <Link> 가 아니다 — 머리말의 이유 그대로 문서를 새로 받는다(막힌 계정은 방금 쿠키를 지웠다). */}
        {deadEnd ? (
          <a
            href={deadEnd.loginHref}
            className="hc-button-secondary inline-flex min-h-11 items-center self-start rounded-full border px-5 text-[13px] font-semibold"
          >
            로그인으로 돌아가기
          </a>
        ) : null}
      </div>
    </main>
  );
}
