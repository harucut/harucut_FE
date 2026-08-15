import { CLIENT_REISSUE_UNAVAILABLE_CODE } from "@harucut/shared";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";

describe("apiError helpers", () => {
  it("extracts code and message from nested API envelope data", () => {
    const details = getApiErrorDetails({
      status: 403,
      data: {
        code: "SUBS-002",
        status: 403,
        message: "Requested history is beyond the plan's retention period.",
      },
    });

    expect(details).toEqual({
      status: 403,
      code: "SUBS-002",
      message: "Requested history is beyond the plan's retention period.",
    });
  });

  it("extracts field errors from a 400 validation envelope", () => {
    const details = getApiErrorDetails({
      status: 400,
      data: {
        code: "GEN-003",
        status: 400,
        message: "Validation failed.",
        data: [{ field: "title", message: "제목은 필수입니다.", rejectedValue: "" }],
      },
    });

    expect(details.fieldErrors).toEqual([
      { field: "title", message: "제목은 필수입니다.", rejectedValue: "" },
    ]);
  });

  it("prioritizes known plan-limit guidance over generic fallback text", () => {
    const message = getUserFacingApiErrorMessage(
      {
        status: 403,
        data: {
          code: "SUBS-003",
          status: 403,
          message: "The number of stored frames exceeds the limit for the current plan.",
        },
      },
      "저장에 실패했어요.",
    );

    expect(message).toBe(
      "지금 요금제로는 프레임을 저장할 수 없어요. 기존 프레임을 지우거나 플랜을 올려 주세요.",
    );
  });

  it("shows the server-provided field error for validation failures", () => {
    const message = getUserFacingApiErrorMessage(
      {
        status: 400,
        data: {
          code: "GEN-003",
          status: 400,
          message: "Validation failed.",
          data: [{ field: "title", message: "제목은 필수입니다." }],
        },
      },
      "저장에 실패했어요.",
    );

    expect(message).toBe("제목은 필수입니다.");
  });

  it("maps known backend codes to Korean copy instead of the English envelope message", () => {
    const message = getUserFacingApiErrorMessage(
      {
        status: 415,
        data: {
          code: "GEN-051",
          status: 415,
          message: "Unsupported media type.",
        },
      },
      "저장에 실패했어요.",
    );

    expect(message).toBe("PNG·JPG·WEBP·GIF만 올릴 수 있어요.");
  });

  it("never surfaces an unmapped English server message", () => {
    const message = getUserFacingApiErrorMessage(
      { status: 400, apiMessage: "Something went sideways.", code: "XYZ-999" },
      "저장에 실패했어요.",
    );

    expect(message).toBe("저장에 실패했어요.");
  });

  it("hides internal Error messages and falls back to the given text", () => {
    const message = getUserFacingApiErrorMessage(
      new Error("Unsupported upload file type: image/heic"),
      "저장에 실패했어요.",
    );

    expect(message).toBe("저장에 실패했어요.");
  });

  it("falls back when the API message is blank", () => {
    const message = getUserFacingApiErrorMessage(
      { status: 500, data: { code: "GEN-500", status: 500, message: "   " } },
      "저장에 실패했어요.",
    );

    expect(message).toBe("저장에 실패했어요.");
  });

  // 재발급 엔드포인트가 5xx·네트워크 오류로 답하지 못한 경우. 최초 401을 그대로 올리면
  // AUTH-012가 읽혀 "로그인이 만료됐어요"가 뜨고 멀쩡한 세션이 재로그인으로 밀린다.
  it("shows a retryable message when token reissue was unavailable", () => {
    const message = getUserFacingApiErrorMessage(
      { status: 503, code: CLIENT_REISSUE_UNAVAILABLE_CODE },
      "저장에 실패했어요.",
    );

    expect(message).toBe(
      "일시적인 문제로 로그인 상태를 갱신하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  });
});
