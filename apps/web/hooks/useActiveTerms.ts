"use client";

import { useEffect, useState } from "react";
import { fetchActiveTerms, termsContentHref } from "@/lib/termsApi";

export type ConsentChoice = {
  code: string;
  title: string;
  required: boolean;
  /** 우리 약관 화면 주소. 없으면 `content` 를 그 자리에서 펼친다. */
  href: string | null;
  /** 서버가 준 본문. 우리 화면이 있는 코드면 null 이다(같은 글을 두 번 보여 주지 않는다). */
  content: string | null;
};

/**
 * 서버가 약관을 하나도 등록하지 않았을 때 쓰는 화면용 목록.
 *
 * **동의를 기록하지는 않는다.** 서버에 없는 코드로 보내면 `TERMS-001` 이라
 * 보낼 수가 없다. 그래도 체크박스는 보여야 한다 — 사용자가 무엇에 동의하는지 알리는
 * 것과, 그 동의를 서버 장부에 남기는 것은 별개의 의무이기 때문이다.
 *
 * 관리자가 `POST /api/admin/terms` 로 약관을 등록하면 이 목록은 저절로 안 쓰인다.
 */
const FALLBACK_TERMS: ConsentChoice[] = [
  {
    code: "terms",
    title: "서비스 이용약관 동의",
    required: true,
    href: "/terms",
    content: null,
  },
  {
    code: "privacy",
    title: "개인정보 수집·이용 동의",
    required: true,
    href: "/privacy",
    content: null,
  },
  {
    code: "marketing",
    title: "마케팅 정보 수신 동의",
    required: false,
    href: "/privacy",
    content: null,
  },
];

export type ActiveTermsState = {
  items: ConsentChoice[];
  /** true 면 서버 장부에 기록할 수 있는 코드다. false 면 화면용 대체 목록이다. */
  fromServer: boolean;
};

/**
 * 가입 화면에 보여 줄 약관 목록.
 *
 * 서버 목록이 비었거나 못 받았으면 대체 목록으로 그린다 — 약관 조회 실패로 **가입 자체가
 * 막히면 안 된다.** 대신 `fromServer` 를 false 로 두어, 호출부가 기록을 건너뛰게 한다.
 */
export function useActiveTerms(): ActiveTermsState {
  const [state, setState] = useState<ActiveTermsState>({
    items: FALLBACK_TERMS,
    fromServer: false,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const terms = await fetchActiveTerms();
        if (cancelled) return;

        if (terms.length === 0) {
          // 증상이 없는 실패다 — 화면은 멀쩡하고 서버 장부만 비어 있다.
          // 개발 중에는 눈에 띄게 남긴다(운영 번들에서는 빠진다).
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[terms] 활성 약관이 하나도 없어 동의를 기록하지 않습니다. " +
                "관리자 API(POST /api/admin/terms)로 약관을 등록해야 기록이 시작됩니다.",
            );
          }
          setState({ items: FALLBACK_TERMS, fromServer: false });
          return;
        }

        setState({
          items: terms.map((term) => {
            const href = termsContentHref(term.code);
            return {
              code: term.code,
              title: term.title,
              required: term.required,
              href,
              content: href ? null : term.content,
            };
          }),
          fromServer: true,
        });
      } catch {
        if (!cancelled) {
          setState({ items: FALLBACK_TERMS, fromServer: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
