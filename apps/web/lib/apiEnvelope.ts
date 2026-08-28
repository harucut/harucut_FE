import type { ApiEnvelope } from "@/lib/api-types";

/**
 * 서버가 200 을 주면서 본문(`data`)을 안 실어 보냈을 때.
 *
 * 봉투 계약상 `data` 는 없을 수 있다. 대부분의 호출부는 그래도 값이 있어야 다음 줄을
 * 쓸 수 있으므로, 조용히 `undefined` 를 흘려보내 화면 저 아래에서
 * "Cannot read properties of undefined" 로 터지게 두지 않고 여기서 끊는다.
 */
export class EmptyResponseError extends Error {
  constructor(readonly what: string) {
    super(`서버 응답에 ${what}가 없어요.`);
    this.name = "EmptyResponseError";
  }
}

/**
 * 봉투에서 `data` 를 꺼낸다. 없으면 `EmptyResponseError`.
 *
 * `what` 은 사용자 문구가 아니라 **어디서 터졌는지 알기 위한 이름**이다
 * (화면 문구는 호출부가 apiError 로 만든다).
 */
export function requireData<T>(envelope: ApiEnvelope<T>, what: string): T {
  const data = envelope.data;
  if (data === undefined || data === null) {
    throw new EmptyResponseError(what);
  }
  return data;
}
