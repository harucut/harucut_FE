/**
 * 비밀번호 바꾸기 다이얼로그의 검증.
 *
 * 서버는 `newPassword` 를 8~20자로 강제한다(ChangePasswordRequest). 넘겨 보내면 400 GEN-003
 * 이 오는데 그 사유가 영문(`size must be between 8 and 20`)이라 `apiError` 가 버리고
 * "입력값을 다시 확인해 주세요."만 남는다 — 어느 칸이 왜 틀렸는지 화면에서 사라진다.
 * 그래서 상한은 보내기 전에 여기서 잡는다.
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

  // 허용 문자 밖(공백·한글 등)도 서버가 거절한다 — 이것도 공용 규칙이 함께 본다.
  it("허용하지 않는 문자가 섞이면 보내지 않는다", () => {
    const { onSubmit, fill } = renderDialog();

    fill("비밀번호12345678");

    expect(
      screen.getByText(/영문, 숫자, 일부 특수문자/),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
