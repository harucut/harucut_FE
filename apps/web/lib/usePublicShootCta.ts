"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { clientApi } from "@/lib/clientApi";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

// 공개 페이지(/pricing 등)의 촬영 CTA 클릭 핸들러.
// 인증 쿠키(accessToken/refreshToken)는 httpOnly라 클라이언트에서 직접 읽을 수 없으므로,
// 앱이 이미 사용하는 /api/auth/status(소셜 로그인 콜백과 동일)로 로그인 여부를 판단한다.
// - 로그인 사용자: 게스트 오버레이/enterGuestMode 없이 /shoot로 직행해
//   회원 스토어를 게스트로 덮어쓰지 않는다(저장 프레임·영상 옵션 유지).
// - 비회원: 기존 게스트 체험 안내(showGuestTrialNotice)를 띄운다.
export function usePublicShootCta() {
  const router = useRouter();
  const showGuestTrialNotice = useGuestTrialStore(
    (state) => state.showGuestTrialNotice,
  );
  const pendingRef = useRef(false);

  const onShootCta = useCallback(async () => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;

    try {
      await clientApi.get("/api/auth/status", { cache: "no-store" });
      // 200이면 인증 쿠키가 백엔드에서 유효 → 회원으로 바로 촬영 진입.
      router.push("/shoot");
    } catch {
      // 401 등 비인증/오류 → 게스트 체험 안내.
      showGuestTrialNotice();
    } finally {
      pendingRef.current = false;
    }
  }, [router, showGuestTrialNotice]);

  return { onShootCta };
}
