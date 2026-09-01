/**
 * 봉투에서 값 꺼내기.
 *
 * 서버는 `data` 를 안 실어 보낼 수 있다("없으면 키 자체가 없다" — 스웨거).
 * 값이 꼭 있어야 하는 자리에서 undefined 를 흘려보내면 화면 저 아래에서
 * "Cannot read properties of undefined" 로 터진다. 여기서 끊는 게 목적이다.
 */
import { EmptyResponseError, requireData } from "@/lib/apiEnvelope";

describe("requireData", () => {
  it("값이 있으면 그대로 꺼낸다", () => {
    expect(requireData({ code: "GEN-000", status: 200, data: { a: 1 } }, "값")).toEqual({
      a: 1,
    });
  });

  it("data 키가 없으면 EmptyResponseError", () => {
    expect(() => requireData({ code: "GEN-000", status: 200 }, "내 정보")).toThrow(
      EmptyResponseError,
    );
  });

  it("data 가 null 이어도 EmptyResponseError", () => {
    expect(() =>
      requireData({ code: "GEN-000", status: 200, data: null as never }, "내 정보"),
    ).toThrow(EmptyResponseError);
  });

  it("0 이나 빈 문자열은 값이다 — 걸러내지 않는다", () => {
    expect(requireData({ code: "GEN-000", status: 200, data: 0 }, "개수")).toBe(0);
    expect(requireData({ code: "GEN-000", status: 200, data: "" }, "주소")).toBe("");
  });

  it("어디서 비었는지 메시지에 남긴다", () => {
    expect(() => requireData({ code: "GEN-000", status: 200 }, "합성 작업")).toThrow(
      "합성 작업",
    );
  });
});
