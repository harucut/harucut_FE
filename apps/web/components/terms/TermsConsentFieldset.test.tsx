/**
 * 가입 화면의 약관 묶음.
 * - 맨 위 「전체 동의」는 한 번에 모두 체크하고 모두 푼다.
 * - 빠진 필수 약관은 그 체크칸을 빨갛게(aria-invalid) 하고, 묶음 아래 한 줄로 화면에도 말한다.
 *   색만으로 끝내지 않는다 — 그 한 줄이 체크칸의 설명으로도 읽힌다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { TermsConsentFieldset } from "@/components/terms/TermsConsentFieldset";
import type { ConsentChoice } from "@/hooks/useActiveTerms";

const ITEMS = [
  { code: "terms", title: "서비스 이용약관", required: true, content: "제1조(목적)" },
  { code: "privacy", title: "개인정보 수집·이용 동의", required: true, content: "수집 항목: 이메일" },
  { code: "marketing", title: "마케팅 정보 수신 동의", required: false, content: "혜택 소식" },
] as ConsentChoice[];
const ERROR = "필수 약관에 동의해 주세요.";

function renderFieldset(checked: Record<string, boolean>, error: string | null, onToggle = () => {}) {
  return render(<TermsConsentFieldset items={ITEMS} checked={checked} onToggle={onToggle} error={error} />);
}

describe("TermsConsentFieldset", () => {
  it("빠진 필수 약관만 빨갛게 하고, 그 이유를 묶음 아래 한 줄로 보인다", () => {
    renderFieldset({ terms: true }, ERROR);

    const privacy = screen.getByRole("checkbox", { name: /개인정보 수집·이용 동의/ });
    expect(privacy).toHaveAttribute("aria-invalid", "true");
    expect(privacy).toHaveAccessibleDescription(ERROR);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(ERROR);
    // 화면 읽기 프로그램에만 숨기지 않는다 — 보이는 글자다.
    expect(alert).not.toHaveClass("sr-only");

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

    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("「전체 동의」는 모든 항목을 한 번에 체크하고, 다 체크돼 있으면 모두 푼다", () => {
    const onToggle = jest.fn();
    const { rerender } = renderFieldset({ terms: true }, null, onToggle);

    const all = screen.getByRole("checkbox", { name: "전체 동의" });
    expect(all).not.toBeChecked();
    fireEvent.click(all);
    expect(onToggle.mock.calls).toEqual([
      ["terms", true],
      ["privacy", true],
      ["marketing", true],
    ]);

    onToggle.mockClear();
    rerender(
      <TermsConsentFieldset items={ITEMS} checked={{ terms: true, privacy: true, marketing: true }} onToggle={onToggle} error={null} />,
    );
    expect(screen.getByRole("checkbox", { name: "전체 동의" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "전체 동의" }));
    expect(onToggle.mock.calls).toEqual([
      ["terms", false],
      ["privacy", false],
      ["marketing", false],
    ]);
  });
});
