/**
 * 구운 PNG 의 입력 지문 — `bakeTextLayerPng` 가 읽는 값 그대로다.
 *
 * 저장할 때 지금 지문이 구운 때의 지문과 같으면 다시 굽지 않고 그 PNG 를 다시 쓴다(서버 계약:
 * 「문구·스타일·크기가 저장 때와 같으면 다시 굽지 말고 재저장에 그대로 쓴다」). 다르면 반드시
 * 다시 굽는다 — 서버는 글자와 PNG 가 어긋났는지 모른다. 배치 값(x·y·scale·rotation)은
 * 굽는 입력이 아니라서 넣지 않는다. 스타일 키 순서가 달라 지문이 다르게 나오는 것은 괜찮다 —
 * 한 번 더 구울 뿐이다.
 */
export function textBakeSignature(component: {
  source: string;
  width: number;
  height: number;
  styleJson?: Record<string, unknown>;
}): string {
  return JSON.stringify([
    component.source,
    Math.max(1, Math.round(component.width)),
    Math.max(1, Math.round(component.height)),
    component.styleJson ?? {},
  ]);
}
