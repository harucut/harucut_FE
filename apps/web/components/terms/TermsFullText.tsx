"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

type Props = {
  /** 약관 이름. 아이콘의 이름이 「○○ 전문 보기」로 읽힌다. */
  title: string;
  /** 그 자리에서 펼칠 전문. 없으면 아이콘도 없다. */
  content: string | null | undefined;
  /** 약관 한 줄을 그린다. 펼침 아이콘(전문이 없으면 null)을 받아 줄 오른쪽 끝에 놓는다. */
  children: (toggle: ReactNode) => ReactNode;
};

/**
 * 약관 전문을 줄 오른쪽 끝 아이콘 하나로 펼친다. 가입·마이페이지·재동의 세 화면이 같이 쓴다.
 *
 * 예전에는 줄 아래에 「전문 보기」 글자를 한 줄 더 붙여 약관 하나가 두 줄을 차지했다(2026-11-09 바꿈).
 * 아이콘만 두되 이름은 「○○ 전문 보기」로 읽히고, 펼침 여부는 aria-expanded 로 알린다. 누를 자리는 44px 이다.
 *
 * 아이콘은 체크박스의 label 밖에 둔다. label 안의 버튼은 문법상 틀리고(label 이 이름 붙일 대상이 둘이 된다),
 * 글자를 누르면 체크되는지 펼쳐지는지도 애매해진다.
 */
export function TermsFullText({ title, content, children }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = content ? (
    <button
      type="button"
      aria-label={`${title} 전문 보기`}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen((current) => !current)}
      className="-my-3 -mr-2 ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full text-(--hc-muted) transition hover:text-(--hc-text)"
    >
      <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  ) : null;

  return (
    <>
      {children(toggle)}
      {content ? (
        <p
          id={panelId}
          hidden={!open}
          className="ml-6 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-(--hc-surface-muted) p-2 text-[11px] leading-5 text-(--hc-muted)"
        >
          {content}
        </p>
      ) : null}
    </>
  );
}
