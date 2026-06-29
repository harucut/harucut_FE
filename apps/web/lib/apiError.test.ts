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
      "저장에 실패했습니다.",
    );

    expect(message).toBe("요금제의 월간 프레임 생성 횟수를 초과했습니다.");
  });
});
