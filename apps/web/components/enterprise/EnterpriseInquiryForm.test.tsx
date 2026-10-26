import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { EnterpriseInquiryForm } from "@/components/enterprise/EnterpriseInquiryForm";

const mockSubmit = jest.fn();
jest.mock("@/lib/inquiryApi", () => ({
  ...jest.requireActual("@/lib/inquiryApi"),
  submitInquiry: (...a: unknown[]) => mockSubmit(...a),
}));

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillRequired() {
  fill(/단체·회사 이름/, "하루컷 팬클럽");
  fill(/행사 이름/, "2026 여름 팬미팅");
  fill(/담당자 이름/, "김하루");
  fill(/회신받을 이메일/, "haru@example.com");
}

beforeEach(() => jest.clearAllMocks());

it("필수 항목을 채워야 남길 수 있고, 서버 문의 모양으로 보낸다", async () => {
  mockSubmit.mockResolvedValue({ inquiryId: "Iq123" });
  render(<EnterpriseInquiryForm />);
  const submit = screen.getByRole("button", { name: "문의 남기기" });
  expect(submit).toBeDisabled();

  fillRequired();
  fill(/행사 날짜/, "2026-12-05");
  fill(/예상 참가 인원/, "200");
  fill(/장소/, "성수 ○○홀");
  fireEvent.click(screen.getByLabelText("현장 부스(태블릿)"));
  fireEvent.click(screen.getByLabelText("개인 행사(결혼식·돌잔치 등)"));
  fireEvent.click(submit);

  expect(await screen.findByText("문의를 받았어요.")).toBeInTheDocument();
  expect(screen.getByText(/접수 번호는 Iq123/)).toBeInTheDocument();
  expect(mockSubmit).toHaveBeenCalledWith({
    contactName: "김하루",
    email: "haru@example.com",
    organizerType: "PERSONAL",
    channels: ["BYOD", "BOOTH"],
    expectedDate: "2026-12-05",
    expectedCount: 200,
    message: "단체·회사 이름: 하루컷 팬클럽\n행사 이름: 2026 여름 팬미팅\n장소: 성수 ○○홀",
  });
});

it("참가 방식을 모두 끄거나 이메일 형식이 틀리면 막는다", () => {
  render(<EnterpriseInquiryForm />);
  fillRequired();
  fireEvent.click(screen.getByLabelText("참가자 휴대폰(QR)"));
  expect(screen.getByRole("button", { name: "문의 남기기" })).toBeDisabled();
  expect(screen.getByText("참가 방식을 채우면 문의를 남길 수 있어요.")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("참가자 휴대폰(QR)"));
  fill(/회신받을 이메일/, "haru@");
  expect(screen.getByRole("button", { name: "문의 남기기" })).toBeDisabled();
  expect(screen.getByText("이메일 주소를 확인해 주세요.")).toBeInTheDocument();
});

// 저장이 막혀도(분당 5회 초과 등) 메일로 문의할 길은 남는다.
it("저장에 실패하면 서버 문구를 보여 주고 메일 보내기는 그대로 둔다", async () => {
  mockSubmit.mockRejectedValue(new ApiRequestError({ status: 429, code: "GEN-061", apiMessage: "x" }));
  render(<EnterpriseInquiryForm />);
  fillRequired();
  fireEvent.click(screen.getByRole("button", { name: "문의 남기기" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("요청이 너무 많아요.");
  const mail = screen.getByRole("link", { name: "메일로 보내기" });
  expect(mail.getAttribute("href")).toMatch(/^mailto:/);
  await waitFor(() => expect(decodeURIComponent(mail.getAttribute("href") ?? "")).toContain("행사 이름: 2026 여름 팬미팅"));
});
