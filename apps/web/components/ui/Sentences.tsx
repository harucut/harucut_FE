import { Fragment } from "react";

/**
 * 짧은 안내 글을 문장마다 줄을 나눠 보인다(2026-11-14).
 *
 * 모달·안내 띠처럼 폭이 좁은 자리에 두 문장을 이어 쓰면 문장 중간에서 줄이 넘어갔다
 * (「…하루컷을 쓸 / 수 있어요.」). 문장 끝(. ! ? 뒤 공백)에서 나눠 문장마다 새 줄에서 시작한다.
 *
 * 문장마다 블록으로 감싸고 text-wrap: balance 를 건다 — 한 문장이 두 줄이 되면 두 줄 길이를 맞춰
 * 「…사용할 / 수 없거나」 같은 끊김을 줄인다. <br> 로만 나누면 크롬은 첫 문장만 고르게 나누고
 * 그 뒤 문장은 그대로 감았다(실측).
 *
 * 블록 사이에는 빈칸 글자를 둔다. 글자만 읽는 쪽(화면 낭독기·접근성 설명)이 원래 문장 그대로
 * 「…했어요. 다시…」로 읽고, 블록 사이 빈칸은 화면에 보이지 않는다. 시험에서 한 덩어리 문장으로
 * 찾을 때는 tests/sentenceText 를 쓴다 — 기본 getByText 는 요소의 직접 글자만 본다.
 *
 * 약관·설명 본문처럼 넓은 자리의 긴 글에는 쓰지 않는다 — 문단이 짧은 줄로 조각난다.
 */
export function splitSentences(text: string): string[] {
  // 뒤를 보는 정규식(lookbehind)은 옛 사파리에서 문법 오류라 쓰지 않는다.
  return text
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** 알림 자리는 비어 있을 때도 그려 두는 곳이 많아(aria-live) 빈 값도 받는다 — 그때는 아무것도 그리지 않는다. */
export function Sentences({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const sentences = splitSentences(text);
  if (sentences.length < 2) return <>{text}</>;
  return (
    <>
      {sentences.map((sentence, index) => (
        <Fragment key={index}>
          {index > 0 ? " " : null}
          <span className="block text-balance">{sentence}</span>
        </Fragment>
      ))}
    </>
  );
}
