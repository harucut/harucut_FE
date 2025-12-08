"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

export default function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const authCode = searchParams.get("authorization_code");
      const redirectTo = searchParams.get("redirectTo") || "/home";

      if (!authCode) {
        alert("소셜 로그인이 실패했어요. 다시 시도해 주세요.");
        router.replace("/login");
        return;
      }

      try {
        const res = await api.post(
          `/api/oauth2/authorize/complete`,
          {},
          {
            params: { code: authCode },
          }
        );

        const data = res.data;

        // 개발 단계용: 프론트에서 직접 쿠키에 세팅
        if (data.accessToken) {
          document.cookie = `accessToken=${data.accessToken}; path=/`;
        }
        if (data.refreshToken) {
          document.cookie = `refreshToken=${data.refreshToken}; path=/`;
        }

        router.replace(redirectTo);
      } catch (e) {
        console.error(e);
        alert("로그인 처리 중 오류가 발생했어요.");
        router.replace("/login");
      }
    };

    run();
  }, [searchParams, router]);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-zinc-950 text-white">
      <p className="text-xs text-zinc-400">소셜 로그인 처리 중이에요...</p>
    </main>
  );
}
