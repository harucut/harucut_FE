import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";

describe("apiError helpers", () => {
  it("extracts code and message from nested API envelope data", () => {
    const details = getApiErrorDetails({
      status: 403,
      data: {
        code: "USR-103",
        status: 403,
        message: "요금제에서 허용한 기록 조회 기간을 초과했습니다.",
      },
    });

    expect(details).toEqual({
      status: 403,
      code: "USR-103",
      message: "요금제에서 허용한 기록 조회 기간을 초과했습니다.",
    });
  });

  it("prioritizes known plan-limit guidance over generic fallback text", () => {
    const message = getUserFacingApiErrorMessage(
      {
        status: 403,
        data: {
          code: "USR-102",
          status: 403,
          message: "backend raw message",
        },
      },
      "저장에 실패했어요.",
    );

    expect(message).toBe(
      "요금제의 프레임 보관 개수를 다 썼어요. 기존 프레임을 지우거나 플랜을 올려 주세요.",
    );
  });

  it("shows the server envelope message when there is no known code", () => {
    const message = getUserFacingApiErrorMessage(
      {
        status: 400,
        data: {
          code: "GEN-400",
          status: 400,
          message: "제목을 입력해 주세요.",
        },
      },
      "저장에 실패했어요.",
    );

    expect(message).toBe("제목을 입력해 주세요.");
  });

  it("shows apiMessage from ApiRequestError-like errors", () => {
    const message = getUserFacingApiErrorMessage(
      { status: 400, apiMessage: "닉네임이 중복이에요." },
      "저장에 실패했어요.",
    );

    expect(message).toBe("닉네임이 중복이에요.");
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
});
