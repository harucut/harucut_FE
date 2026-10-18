"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchActiveTerms, termsContentHref } from "@/lib/termsApi";

export type ConsentChoice = {
  code: string;
  title: string;
  required: boolean;
  href: string | null;
  content: string | null;
};

export type ActiveTermsState = {
  items: ConsentChoice[];
  /** 서버에 기록할 수 있는 유효한 활성 약관을 받았을 때만 true. */
  fromServer: boolean;
  status: "loading" | "ready" | "unavailable";
  reload: () => void;
};

/** 기록할 수 없는 대체 체크박스로 가입을 완료시키지 않는다. 체험은 계속 열어 둔다. */
export function useActiveTerms(): ActiveTermsState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<ActiveTermsState, "reload">>({
    items: [],
    fromServer: false,
    status: "loading",
  });
  const reload = useCallback(() => {
    setState({ items: [], fromServer: false, status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const terms = await fetchActiveTerms();
        if (cancelled) return;
        const valid = terms.some((term) => term.required) && terms.every(
          (term) => term.code?.trim() && term.title?.trim() && term.content?.trim() && term.version > 0,
        );
        if (!valid) {
          setState({ items: [], fromServer: false, status: "unavailable" });
          return;
        }
        setState({
          items: terms.map((term) => {
            const href = termsContentHref(term.code);
            return { code: term.code, title: term.title, required: term.required, href, content: href ? null : term.content };
          }),
          fromServer: true,
          status: "ready",
        });
      } catch {
        if (!cancelled) setState({ items: [], fromServer: false, status: "unavailable" });
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  return { ...state, reload };
}
