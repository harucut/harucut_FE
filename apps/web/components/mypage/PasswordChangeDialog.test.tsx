/**
 * 비밀번호 바꾸기 다이얼로그의 검증.
 *
 * 서버가 `newPassword` 에 거는 것은 **길이 8~20자뿐이다** — `ChangePasswordRequest` 는
 * `@NotBlank` + `@Size(8, 20)` 이 전부고 `@Pattern` 이 없다(실행 중인 jar 실측).
 *
 *  - 상한은 여기서 잡는다. 넘겨 보내면 400 GEN-003 이 오는데 사유가 영문
 *    (`size must be between 8 and 20`)이라 `apiError` 가 버리고 "입력값을 다시 확인해
 *    주세요."만 남는다 — 어느 칸이 왜 틀렸는지 화면에서 사라진다.
 *  - 문자 종류는 여기서 잡지 않는다. 가입용 공용 규칙을 끌어오면 서버가 받아 주는
 *    비밀번호를 화면이 막는다(실측 2026-09-02: `PATCH /api/harucut/change/password` 에
 *    `abcd~1234` → 200 GEN-000).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { PasswordChangeDialog } from "@/components/mypage/PasswordChangeDialog";

function renderDialog() {
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  render(
    <PasswordChangeDialog
      saving={false}
      error={null}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );

  const fill = (newPassword: string) => {
    fireEvent.change(screen.getByLabelText("현재 비밀번호"), {
      target: { value: "oldpassword1" },
    });
    fireEvent.change(screen.getByLabelText("새 비밀번호"), {
      target: { value: newPassword },
    });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), {
      target: { value: newPassword },
    });
    fireEvent.click(screen.getByRole("button", { name: "바꾸기" }));
  };

  return { onSubmit, fill };
}

describe("PasswordChangeDialog", () => {
  it("21자 새 비밀번호는 보내지 않고 20자 상한을 짚어 준다", () => {
    const { onSubmit, fill } = renderDialog();

    // 21자. 실측으로 서버가 400 GEN-003 을 주는 길이다.
    fill("abcdefghij1234567890X");

    expect(
      screen.getByText("비밀번호는 20자 이하여야 합니다."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // 상한을 한 칸 어긋나게 잡으면 20자가 막힌다. 서버가 받아 주는 길이는 통과해야 한다.
  it("20자 새 비밀번호는 그대로 보낸다", () => {
    const { onSubmit, fill } = renderDialog();

    fill("abcdefghij1234567890");

    expect(onSubmit).toHaveBeenCalledWith({
      oldPassword: "oldpassword1",
      newPassword: "abcdefghij1234567890",
    });
  });

  // 하한도 같은 이유로 여기서 잡는다.
  it("7자 새 비밀번호는 보내지 않고 8자 하한을 짚어 준다", () => {
    const { onSubmit, fill } = renderDialog();

    fill("abc1234");

    expect(
      screen.getByText("비밀번호는 최소 8자 이상이어야 합니다."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /**
   * 반대쪽 함정. 서버가 정하지 않은 규칙을 화면이 세우면 안 된다.
   *
   * 이 API 에는 문자 제한이 없다 — 가입용 공용 `validatePassword()` 의 화이트리스트를
   * 그대로 쓰면 `~` 가 걸려 서버가 받아 줄 비밀번호를 요청 전에 막는다.
   * 실측 2026-09-02: `abcd~1234` 로 변경 → 200 GEN-000, 그 값으로 로그인도 된다.
   */
  it("서버가 받아 주는 문자는 막지 않는다 — 물결표가 섞여도 보낸다", () => {
    const { onSubmit, fill } = renderDialog();

    fill("abcd~1234");

    expect(onSubmit).toHaveBeenCalledWith({
      oldPassword: "oldpassword1",
      newPassword: "abcd~1234",
    });
  });

  // 같은 이유로 한글도 막지 않는다. 실측 2026-09-02: `비밀번호12345678` → 200 GEN-000.
  it("한글 비밀번호도 길이만 맞으면 보낸다", () => {
    const { onSubmit, fill } = renderDialog();

    fill("비밀번호12345678");

    expect(onSubmit).toHaveBeenCalledWith({
      oldPassword: "oldpassword1",
      newPassword: "비밀번호12345678",
    });
  });

  /*
    ── 회귀: 바꾸는 중에는 닫히지 않는다 ──

    닫는 길이 셋이다 — 배경 · 취소 버튼 · Escape. PATCH 가 도는 사이 그중 하나로 닫히면
    화면은 취소한 것처럼 사라지지만 요청은 계속 간다. 성공하면 본인도 모르는 사이에
    비밀번호가 바뀌고, 실패하면 그 사유가 이미 닫힌 다이얼로그에 들어가 아무에게도
    안 보인다. 요청을 되돌릴 수는 없으니, 결과를 볼 자리라도 지킨다.
  */
  it("바꾸는 중에는 배경·취소·Escape 어느 쪽으로도 닫히지 않는다", () => {
    const onClose = jest.fn();
    render(
      <PasswordChangeDialog
        saving
        error={null}
        onClose={onClose}
        onSubmit={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    // 눌러도 소용없는 버튼을 눌러 보게 두지 않는다.
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  });

  it("바꾸는 중이 아니면 세 길 모두 그대로 닫힌다", () => {
    const onClose = jest.fn();
    render(
      <PasswordChangeDialog
        saving={false}
        error={null}
        onClose={onClose}
        onSubmit={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
