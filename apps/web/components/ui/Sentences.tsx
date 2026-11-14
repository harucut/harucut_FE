import { Fragment } from "react";

/**
 * 짧은 안내 글을 문장마다 줄을 나눠 보인다(2026-11-14).
 *
 * 모달·안내 띠처럼 폭이 좁은 자리에 두 문장을 이어 쓰면 문장 중간에서 줄이 넘어갔다
 * (「…하루컷을 쓸 / 수 있어요.」). 문장 끝(. ! ? 뒤 공백)에서 나눠 문장마다 새 줄에서 시작한다.
 * 한 문장이 길면 그 안에서는 평소처럼 단어 단위로 감긴다(globals.css 의 keep-all·pretty).
 *
 * 문장 사이에는 빈칸을 남기고 그 뒤에 줄바꿈을 둔다. 글자만 읽는 쪽(화면 낭독기, 접근성 이름,
 * 시험의 텍스트 비교)은 원래 문장 그대로 「…했어요. 다시…」로 읽고, 줄 끝 빈칸은 화면에 보이지 않는다.
 * 문장마다 블록으로 감싸면 그 빈칸이 사라져 「…했어요.다시…」로 붙어 읽혔다.
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
          {index > 0 && (
            <>
              {" "}
              {/* 이 표시가 있는 문단은 globals.css 가 text-wrap: balance 로 고르게 나눈다. */}
              <br data-sentence-break="" />
            </>
          )}
          {sentence}
        </Fragment>
      ))}
    </>
  );
}
