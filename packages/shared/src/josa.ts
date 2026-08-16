/**
 * 한국어 조사를 앞 글자에 맞춰 고른다.
 *
 * 화면 문구에 `을(를)`처럼 두 개를 다 적어 두면 읽는 사람이 골라 읽어야 한다. 사람이 쓴
 * 문장처럼 보이지도 않는다. 앞 글자의 받침 유무는 코드로 판정할 수 있으므로 여기서 정한다.
 *
 * 판정: 한글 음절은 유니코드에서 `가`(0xAC00)부터 28개 종성이 한 묶음으로 반복된다.
 * (코드 - 0xAC00) % 28 이 0이면 받침이 없다.
 *
 * 한글이 아닌 글자로 끝나면(영문·숫자·기호) 받침을 알 수 없다. 그럴 때는 받침 없는 쪽을
 * 쓴다 — "QR를"이 "QR을"보다 어색하지 않고, 우리 문구에 나오는 영문은 대부분
 * 알파벳 이름을 그대로 읽는 경우다.
 */
const PAIRS = {
  '을/를': ['를', '을'],
  '이/가': ['가', '이'],
  '은/는': ['는', '은'],
  '와/과': ['와', '과'],
  '으로/로': ['로', '으로'],
} as const;

export type JosaPair = keyof typeof PAIRS;

/** 마지막 글자에 받침이 있으면 true. 한글이 아니면 false. */
export function hasFinalConsonant(word: string): boolean {
  const last = word.trimEnd().slice(-1);
  if (!last) return false;

  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;

  const jongseong = (code - 0xac00) % 28;
  // 'ㄹ' 받침(8)은 "으로/로"에서 받침 없는 쪽을 쓴다. 그 예외는 josa() 가 따로 본다.
  return jongseong !== 0;
}

/** `josa("연락처", "을/를")` → `"를"` */
export function josa(word: string, pair: JosaPair): string {
  const [withoutFinal, withFinal] = PAIRS[pair];
  if (!hasFinalConsonant(word)) return withoutFinal;

  // "서울로", "연필로"처럼 ㄹ 받침은 "으로"가 아니라 "로"를 쓴다.
  if (pair === '으로/로') {
    const code = word.trimEnd().slice(-1).charCodeAt(0);
    if ((code - 0xac00) % 28 === 8) return withoutFinal;
  }

  return withFinal;
}

/** `withJosa("연락처", "을/를")` → `"연락처를"` */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}
