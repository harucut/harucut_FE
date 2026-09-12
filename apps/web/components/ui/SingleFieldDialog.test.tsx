/**
 * 한 칸짜리 입력 다이얼로그 — **저장이 도는 중에는 닫히지 않는다.**
 *
 * 닫는 길이 셋이다(배경 · 취소 · Escape). `PATCH` 가 도는 중에 그중 하나로 닫히면 화면은
 * 취소한 것처럼 보이지만 요청은 계속 간다 — 성공하면 사용자가 보지 못한 채 값이 바뀌고
 * (닉네임 · 기록 이름), 실패하면 그 사유가 이미 닫힌 다이얼로그에만 남는다.
 *
 * 요청 자체는 되돌릴 수 없으니, 할 수 있는 일은 결과를 볼 자리를 지키는 것이다.
 * `PasswordChangeDialog`·`ConfirmDialog` 와 같은 규칙이다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { SingleFieldDialog } from "@/components/ui/SingleFieldDialog";

function renderDialog(saving: boolean) {
  const onClose = jest.fn();
  render(
    <SingleFieldDialog
      title="이름 바꾸기"
      label="새 이름"
      initialValue="바다에서"
      saving={saving}
      error={null}
      onClose={onClose}
      onSubmit={jest.fn()}
    />,
  );
  return onClose;
}

describe("SingleFieldDialog", () => {
  it("저장 중에는 배경·취소·Escape 어느 쪽으로도 닫히지 않는다", () => {
    const onClose = renderDialog(true);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    // 눌러도 소용없는 버튼을 눌러 보게 두지 않는다.
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  });

  /*
    반대쪽 못 — 저장 중이 아니면 셋 다 그대로 닫힌다. 이 못이 없으면 「늘 막는다」로
    고쳐도 위 테스트가 통과하고, 그러면 사용자가 다이얼로그에 갇힌다.
  */
  it("저장 중이 아니면 세 길 모두 그대로 닫힌다", () => {
    const onClose = renderDialog(false);

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  /*
    회귀 — **배경 버튼은 `disabled` 로 막지 않는다.**

    붙이면 저장 중에 눌릴 수 있는 컨트롤이 하나도 남지 않아 `useModalDialog` 의 포커스
    트랩이 죽는다(`focusables()` 가 `button:not([disabled])` 로 거른다). `ConfirmDialog`
    에서 같은 이유로 뺐고, 입력까지 `disabled` 인 이 화면은 더 그렇다.
    막는 것은 `disabled` 가 아니라 `requestClose` 안의 가드다.
  */
  it("저장 중에도 배경 버튼 자체는 포커스를 받을 수 있다", () => {
    renderDialog(true);

    expect(screen.getByRole("button", { name: "닫기" })).not.toBeDisabled();
  });
});
