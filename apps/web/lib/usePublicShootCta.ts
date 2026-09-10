"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { isUsableMember } from "@/lib/authSession";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

/**
 * 공개 페이지(랜딩·로그인·요금제·하단 탭바)의 촬영 CTA 클릭 핸들러.
 *
 * - 회원: 게스트 안내도 `enterGuestMode()` 도 없이 `/shoot` 으로 직행한다. 회원 스토어를
 *   게스트로 덮어쓰지 않아 저장 프레임 옵션이 그대로 남는다.
 * - 비회원: 기존 게스트 체험 안내(`showGuestTrialNotice`)를 띄운다.
 */
export function usePublicShootCta() {
  const router = useRouter();
  const showGuestTrialNotice = useGuestTrialStore(
    (state) => state.showGuestTrialNotice,
  );
  const exitGuestMode = useGuestTrialStore((state) => state.exitGuestMode);
  const pendingRef = useRef(false);

  const onShootCta = useCallback(async () => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;

    try {
      if (await isUsableMember()) {
        /*
          **회원이면 남아 있는 게스트 쿠키를 여기서 걷어낸다.**

          이 판정이 붙기 전에는 로그인한 사람이 이 버튼을 눌러도 체험 안내가 떴고, 확인
          한 번에 7일짜리 게스트 쿠키가 심겼다. 그렇게 심긴 쿠키는 이 화면을 고쳐도 저절로
          없어지지 않는다 — `hydrateGuestMode()` 가 매번 다시 읽어 `accessMode: "guest"` 로
          만들고, 그동안 `/shoot` 은 저장 프레임을 감추고 결과를 서버 기록 대신 브라우저에서만
          합성한다. 쿠키가 만료(7일)되거나 명시적으로 로그아웃했다 다시 로그인하기 전까지
          그대로다.

          지금 이 사람은 서버가 방금 확인해 준 회원이다. 그 사실이 게스트 쿠키보다 새롭고
          정확하므로 여기서 정리한다 — 앞 배포에서 눌러 버린 사람도 이 버튼을 한 번 더
          누르면 회원 경험으로 돌아온다.
        */
        exitGuestMode();
        router.push("/shoot");
        return;
      }

      showGuestTrialNotice();
    } finally {
      pendingRef.current = false;
    }
  }, [exitGuestMode, router, showGuestTrialNotice]);

  return { onShootCta };
}
