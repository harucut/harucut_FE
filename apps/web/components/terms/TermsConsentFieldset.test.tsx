/**
 * 가입 화면의 약관 묶음. 빠진 필수 약관은 문장 대신 그 줄을 빨갛게 표시한다.
 * 색만 바꾸면 보조기기와 색을 구분하기 어려운 사람에게 전해지지 않으므로,
 * 체크박스의 aria-invalid 와 화면 읽기 프로그램용 문장이 함께 붙는지를 못 박는다.
 */
import { render, screen } from "@testing-library/react";
import { TermsConsentFieldset } from "@/components/terms/TermsConsentFieldset";
import type { ConsentChoice } from "@/hooks/useActiveTerms";

const ITEMS = [
  { code: "terms", title: "서비스 이용약관", required: true, content: "제1조(목적)" },
  { code: "privacy", title: "개인정보 수집·이용 동의", required: true, content: "수집 항목: 이메일" },
  { code: "marketing", title: "마케팅 정보 수신 동의", required: false, content: "혜택 소식" },
] as ConsentChoice[];
const ERROR = "개인정보 수집·이용 동의에 동의해야 가입할 수 있어요.";

function renderFieldset(checked: Record<string, boolean>, error: string | null) {
  return render(<TermsConsentFieldset items={ITEMS} checked={checked} onToggle={() => {}} error={error} />);
}

describe("TermsConsentFieldset", () => {
  it("빠진 필수 약관만 표시하고, 문장은 그 체크박스에 이어 화면 읽기 프로그램에 읽힌다", () => {
    renderFieldset({ terms: true }, ERROR);

    const privacy = screen.getByRole("checkbox", { name: /개인정보 수집·이용 동의/ });
    expect(privacy).toHaveAttribute("aria-invalid", "true");
    expect(privacy).toHaveAccessibleDescription(ERROR);
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR);

    // 체크한 필수 약관과 선택 약관은 표시하지 않는다.
    expect(screen.getByRole("checkbox", { name: /서비스 이용약관/ })).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByRole("checkbox", { name: /마케팅 정보 수신 동의/ })).toHaveAttribute("aria-invalid", "false");
  });

  it("필수 약관을 다 체크하면 표시와 문장을 거둔다", () => {
    const { rerender } = renderFieldset({ terms: true }, ERROR);
    rerender(<TermsConsentFieldset items={ITEMS} checked={{ terms: true, privacy: true }} onToggle={() => {}} error={ERROR} />);

    expect(screen.getByRole("checkbox", { name: /개인정보 수집·이용 동의/ })).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("제출 전(오류 없음)에는 아무것도 표시하지 않는다", () => {
    renderFieldset({}, null);

    for (const box of screen.getAllByRole("checkbox")) expect(box).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
