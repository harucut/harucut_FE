/** 표시용 행사 이름. 제어 문자·방향 제어를 걷고 이모지 한 글자를 중간에 자르지 않는다. */
export function sanitizeEventName(input: string | null | undefined): string | null {
  const clean = (input ?? "").normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, (char) => char === "\u200d" ? char : "").trim();
  const segments = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(clean)].map((part) => part.segment)
    : Array.from(clean);
  let result = "";
  for (const segment of segments.slice(0, 40)) {
    if (result.length + segment.length > 200) break;
    result += segment;
  }
  return result || null;
}
