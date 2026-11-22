"use client";

/*
  앱 로그인(P4)의 코드 교환 화면. 셸이 시스템 브라우저에서 받은 일회용 코드와 PKCE verifier 를
  fragment(`#code=…&verifier=…`)로 넘긴다 — fragment 는 서버로 가지 않아 로그·Referer 에 남지 않는다.

  교환에 성공하면 세션 쿠키가 이 WebView 에 생긴다. 그 뒤는 소셜 로그인 콜백(`/oauth2/callback`)이
  하던 일(상태 확인·탈퇴 취소·체험 쿠키 정리·돌아갈 곳)을 그대로 맡긴다. 이동은 문서를 새로 받는다 —
  인증 경계라 클라이언트 전환을 쓰지 않는다(app/oauth2/callback/page.tsx 머리말).
*/

import { useEffect, useRef } from "react";
import { exchangeAppLoginCode } from "@/lib/auth/authApi";
import { replaceLocation } from "@/lib/redirect";

/**
 * 코드가 없거나 교환에 실패하면 로그인 화면으로 돌려보낸다. 그 화면이 폼 위 한 줄
 * (「로그인을 마치지 못했어요.」, socialError=1)로 말하고, 다시 시도할 단추도 거기 있다.
 * 예전에는 여기서 실패 문장과 「로그인으로 돌아가기」를 따로 보였다(2026-11-14 소셜 콜백과 맞춤).
 */
const LOGIN_AFTER_FAILURE = "/login?socialError=1";

export default function AppLoginCallbackPage() {
  const started = useRef(false);

  useEffect(() => {
    // 개발 모드의 effect 두 번 실행에서 일회용 코드를 두 번 쓰지 않게 한다.
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get("code");
    const codeVerifier = params.get("verifier");
    // 코드가 기록·뒤로 가기에 남지 않게 주소에서 바로 지운다.
    window.history.replaceState(null, "", window.location.pathname);

    if (!code || !codeVerifier) {
      replaceLocation(LOGIN_AFTER_FAILURE);
      return;
    }
    exchangeAppLoginCode(code, codeVerifier)
      .then(() => {
        replaceLocation("/oauth2/callback");
      })
      .catch((cause: unknown) => {
        console.error(cause);
        replaceLocation(LOGIN_AFTER_FAILURE);
      });
  }, []);

  return (
    <main className="hc-page-app flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-(--hc-text)">
      <p role="status" className="text-[15px] text-(--hc-muted)">
        로그인을 마치는 중이에요.
      </p>
    </main>
  );
}
