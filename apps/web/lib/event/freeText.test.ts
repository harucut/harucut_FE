import { ApiRequestError } from "@/lib/clientApi";
import {
  freeTextErrorMessage,
  freeTextLength,
  freeTextLines,
  localFreeTextProblem,
  normalizeFreeText,
} from "@/lib/event/freeText";

const limits = { maxLength: 5, maxLines: 2 };

it("줄바꿈은 글자 수에 넣지 않고, 한글·이모지 한 자는 1로 센다", () => {
  expect(freeTextLength("가나\n다")).toBe(3);
  expect(freeTextLength("a🎉")).toBe(2);
});

it("서버와 같은 순서로 정리한다 — NFC, 줄바꿈 통일, 줄마다 앞뒤 공백, 앞뒤 빈 줄", () => {
  const nfd = "\u1100\u1161"; // ㄱ + ㅏ (자모 분리 입력)
  expect(normalizeFreeText(nfd)).toBe("가");
  expect(normalizeFreeText("\r\n  축하 \r\n\r\n 해요  \n\n")).toBe("축하\n\n해요");
  expect(freeTextLength(nfd)).toBe(1);
  // 가운데 빈 줄은 줄 수에 든다.
  expect(freeTextLines("축하\n\n해요")).toBe(3);
  expect(freeTextLines("  \n ")).toBe(0);
});

it("빈 문구·글자 수·줄 수를 서버와 같은 문구로 미리 거른다", () => {
  expect(localFreeTextProblem("  ", limits)).toBe("문구를 입력해 주세요.");
  expect(localFreeTextProblem("여섯글자문구", limits)).toBe("5자까지 쓸 수 있어요.");
  expect(localFreeTextProblem("가\n나\n다", limits)).toBe("2줄까지 쓸 수 있어요.");
  expect(localFreeTextProblem("가나\n다", limits)).toBeNull();
});

function part008(data: unknown) {
  return new ApiRequestError({ status: 400, code: "PART-008", data: { code: "PART-008", status: 400, data } });
}

it("PART-008 은 사유마다 문구를 고르고, 한도 값을 끼워 넣는다", () => {
  expect(freeTextErrorMessage(part008({ reason: "TOO_LONG", maxLength: 20 }))).toBe("20자까지 쓸 수 있어요.");
  expect(freeTextErrorMessage(part008({ reason: "DOES_NOT_FIT" }))).toMatch(/칸에 들어가지 않아요/);
  expect(freeTextErrorMessage(part008({ reason: "SOMETHING_NEW" }))).toBe("문구를 다시 확인해 주세요.");
  expect(freeTextErrorMessage(part008(undefined))).toBe("문구를 다시 확인해 주세요.");
});

it("PART-008 이 아니면 null — 호출부가 일반 문구를 고른다", () => {
  expect(freeTextErrorMessage(new ApiRequestError({ status: 403, code: "PART-007", data: { code: "PART-007" } }))).toBeNull();
  expect(freeTextErrorMessage(new Error("x"))).toBeNull();
});
