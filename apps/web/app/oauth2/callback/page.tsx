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
import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, UserStatus } from "@/lib/api-types";
import { reactivateAccount } from "@/lib/auth/authApi";
import { resolveRedirectTarget } from "@/lib/redirect";
import { startSocialLogin } from "@/lib/authLogin";
import {
  clearSocialLoginProvider,
  consumeSocialLoginRedirect,
  hasSocialLoginReactivated,
  markSocialLoginReactivated,
  readSocialLoginProvider,
} from "@/lib/socialLoginRedirect";

type AuthStatusResponse = {
  userStatus?: unknown;
  status?: unknown;
  accountStatus?: unknown;
};

const USER_STATUS_VALUES = new Set<UserStatus>([
  "ACTIVE",
  "DELETED",
  "DELETED_REQUESTED",
  "BLOCKED",
]);

function readUserStatus(data: AuthStatusResponse) {
  const candidates = [data.userStatus, data.accountStatus, data.status];

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      USER_STATUS_VALUES.has(candidate as UserStatus)
    ) {
      return candidate as UserStatus;
    }
  }

  return null;
}

export default function OAuthCallbackPage() {
  const [message, setMessage] = useState("소셜 로그인 상태를 확인하는 중이에요.");
  const isHandlingRef = useRef(false);

  useEffect(() => {
    if (isHandlingRef.current) return;
    isHandlingRef.current = true;

    let cancelled = false;

    async function completeSocialLogin() {
      const redirectTarget = resolveRedirectTarget(consumeSocialLoginRedirect());

      try {
        const response = await clientApi.get<ApiEnvelope<AuthStatusResponse>>(
          "/api/auth/status",
          { cache: "no-store" },
        );

        if (cancelled) return;

        const userStatus = readUserStatus(response.data.data ?? {});
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

        clearSocialLoginProvider();

        if (!cancelled) {
          window.location.href = redirectTarget;
        }
      } catch (error) {
        console.error(error);
        await clientApi.delete("/api/client/logout").catch(() => undefined);
        alert("소셜 로그인 상태를 확인하지 못했어요.");
        if (!cancelled) {
          window.location.href = "/login";
        }
      }
    }

    void completeSocialLogin();

    return () => {
      cancelled = true;
      isHandlingRef.current = false;
    };
  }, []);

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-(--hc-text)">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h1 className="text-base font-semibold">로그인 처리 중</h1>
        <p className="text-sm text-zinc-400">{message}</p>
      </div>
    </main>
  );
}
