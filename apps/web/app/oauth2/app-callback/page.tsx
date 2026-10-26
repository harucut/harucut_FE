"use client";

/*
  앱 로그인(P4)의 코드 교환 화면. 셸이 시스템 브라우저에서 받은 일회용 코드와 PKCE verifier 를
  fragment(`#code=…&verifier=…`)로 넘긴다 — fragment 는 서버로 가지 않아 로그·Referer 에 남지 않는다.

  교환에 성공하면 세션 쿠키가 이 WebView 에 생긴다. 그 뒤는 소셜 로그인 콜백(`/oauth2/callback`)이
  하던 일(상태 확인·탈퇴 취소·체험 쿠키 정리·돌아갈 곳)을 그대로 맡긴다. 이동은 문서를 새로 받는다 —
  인증 경계라 클라이언트 전환을 쓰지 않는다(app/oauth2/callback/page.tsx 머리말).
*/

import { useEffect, useRef, useState } from "react";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { exchangeAppLoginCode } from "@/lib/auth/authApi";

const FALLBACK = "로그인을 마치지 못했어요. 다시 로그인해 주세요.";

export default function AppLoginCallbackPage() {
  const [error, setError] = useState<string | null>(null);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 주소를 한 번 읽어 정하는 값
      setError(FALLBACK);
      return;
    }
    exchangeAppLoginCode(code, codeVerifier)
      .then(() => {
        window.location.replace("/oauth2/callback");
      })
      .catch((cause) => setError(getUserFacingApiErrorMessage(cause, FALLBACK)));
  }, []);

  return (
    <main className="hc-page-app flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-(--hc-text)">
      {error ? (
        <>
          <p role="alert" className="text-center text-[15px]">
            {error}
          </p>
          <a href="/login" className="hc-button-primary flex h-11 items-center rounded-full px-5 text-[14px] font-semibold">
            로그인으로 돌아가기
          </a>
        </>
      ) : (
        <p role="status" className="text-[15px] text-(--hc-muted)">
          로그인을 마치는 중이에요.
        </p>
      )}
    </main>
  );
}
