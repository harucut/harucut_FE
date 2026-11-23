/**
 * 약관 전문은 줄 오른쪽 끝 아이콘 하나로 펼친다. 아이콘만 남겼으니 이름과 펼침 상태가
 * 보조기기에 그대로 전해지는지를 못 박는다 — 글자 링크일 때는 글자가 곧 이름이었다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { TermsFullText } from "@/components/terms/TermsFullText";

describe("TermsFullText", () => {
  it("아이콘 이름은 「약관 이름 + 전문 보기」이고, 누르면 전문을 펼쳤다 접는다", () => {
    render(
      <TermsFullText title="서비스 이용약관" content="제1조(목적) 이 약관은 하루컷 이용 조건을 정합니다.">
        {(toggle) => (
          <div>
            <label>
              <input type="checkbox" /> [필수] 서비스 이용약관
            </label>
            {toggle}
          </div>
        )}
      </TermsFullText>,
    );

    const button = screen.getByRole("button", { name: "서비스 이용약관 전문 보기" });
    const panel = screen.getByText("제1조(목적) 이 약관은 하루컷 이용 조건을 정합니다.");
    expect(button).toHaveAttribute("aria-controls", panel.id);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toBeVisible();
  });

  it("아이콘을 눌러도 체크박스는 그대로다 — 펼치기와 동의는 다른 동작이다", () => {
    render(
      <TermsFullText title="개인정보 수집·이용 동의" content="수집 항목: 이메일, 닉네임">
        {(toggle) => (
          <div>
            <label>
              <input type="checkbox" /> [필수] 개인정보 수집·이용 동의
            </label>
            {toggle}
          </div>
        )}
      </TermsFullText>,
    );

    fireEvent.click(screen.getByRole("button", { name: "개인정보 수집·이용 동의 전문 보기" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("전문이 없으면 아이콘도 패널도 없다", () => {
    render(
      <TermsFullText title="마케팅 정보 수신 동의" content={null}>
        {(toggle) => <div>{toggle}</div>}
      </TermsFullText>,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });
});
