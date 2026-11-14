import type { MatcherFunction } from "@testing-library/react";

/**
 * 문장마다 줄을 나눈 안내(components/ui/Sentences)를 원래 문장 그대로 찾는다.
 *
 * Sentences 는 문장마다 블록으로 감싼다. 기본 getByText 는 요소의 **직접** 글자만 보므로
 * 「…했어요. 다시…」 한 덩어리로는 찾지 못한다. 글자 전체(textContent)가 같은 가장 안쪽 요소를 고른다.
 *
 *   screen.getByText(sentenceText("로그인을 마치지 못했어요. 다시 시도해 주세요."))
 */
export function sentenceText(text: string): MatcherFunction {
  const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
  return (_content, element) => {
    if (!element || normalize(element.textContent) !== text) return false;
    return !Array.from(element.children).some((child) => normalize(child.textContent) === text);
  };
}
