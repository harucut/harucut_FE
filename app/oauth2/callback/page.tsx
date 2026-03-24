"use client";

import { useEffect, useRef, useState } from "react";
import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, UserStatus } from "@/lib/api-types";
import { reactivateAccount } from "@/lib/auth/authApi";
import { resolveRedirectTarget } from "@/lib/redirect";
import { consumeSocialLoginRedirect } from "@/lib/socialLoginRedirect";

type AuthStatusResponse = {
  userStatus?: unknown;
  status?: unknown;
  accountStatus?: unknown;
};

const USER_STATUS_VALUES = new Set<UserStatus>([
  "ACTIVE",
  "DELETED",
  "DELETED_REQUESTED",
  "SUSPENDED",
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
        }

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
    <main className="min-h-dvh bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h1 className="text-base font-semibold">로그인 처리 중</h1>
        <p className="text-sm text-zinc-400">{message}</p>
      </div>
    </main>
  );
}
