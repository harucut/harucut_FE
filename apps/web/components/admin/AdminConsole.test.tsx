import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { AdminConsole } from "@/components/admin/AdminConsole";

const api = {
  listInquiries: jest.fn(),
  updateInquiry: jest.fn(),
  listContracts: jest.fn(),
  createContract: jest.fn(),
  changeContractStatus: jest.fn(),
  listEntitlements: jest.fn(),
  grantEntitlement: jest.fn(),
  getEntitlementImpact: jest.fn(),
  revokeEntitlement: jest.fn(),
  searchWorkspaces: jest.fn(),
  searchEvents: jest.fn(),
};
jest.mock("@/components/layout/AppNav", () => ({ AppNav: () => null }));
jest.mock("@/lib/admin/cmsApi", () => ({
  ...jest.requireActual("@/lib/admin/cmsApi"),
  searchWorkspaces: (...a: unknown[]) => api.searchWorkspaces(...a),
  searchEvents: (...a: unknown[]) => api.searchEvents(...a),
  listInquiries: (...a: unknown[]) => api.listInquiries(...a),
  updateInquiry: (...a: unknown[]) => api.updateInquiry(...a),
  listContracts: (...a: unknown[]) => api.listContracts(...a),
  createContract: (...a: unknown[]) => api.createContract(...a),
  changeContractStatus: (...a: unknown[]) => api.changeContractStatus(...a),
  listEntitlements: (...a: unknown[]) => api.listEntitlements(...a),
  grantEntitlement: (...a: unknown[]) => api.grantEntitlement(...a),
  getEntitlementImpact: (...a: unknown[]) => api.getEntitlementImpact(...a),
  revokeEntitlement: (...a: unknown[]) => api.revokeEntitlement(...a),
}));

const INQUIRY = {
  inquiryId: "Iq1",
  contactName: "김하루",
  email: "haru@example.com",
  organizerType: "BUSINESS",
  channels: "BYOD,BOOTH",
  expectedDate: "2026-12-05",
  expectedCount: 200,
  message: "행사 이름: 2026 여름 팬미팅",
  status: "NEW",
  createdAt: "2026-10-26T01:00:00Z",
};

const TERMS = { composeQuota: 500, retentionDays: 30, features: ["CUSTOM_THEME"] };
const CONTRACT = {
  contractId: "Ct1",
  workspaceId: "Ws1",
  contractorName: "하루컷 팬클럽",
  scope: "WORKSPACE",
  startsAt: "2026-11-01T00:00:00+09:00",
  endsAt: "2026-12-31T23:59:00+09:00",
  amount: 300000,
  currency: "KRW",
  entitlement: TERMS,
  status: "DRAFT",
  createdAt: "x",
};
const ENTITLEMENT = {
  entitlementId: "En1",
  scope: "WORKSPACE",
  workspaceId: "Ws1",
  source: "MANUAL",
  status: "ACTIVE",
  terms: TERMS,
  used: 10,
  reserved: 1,
  validFrom: "2026-10-01T00:00:00Z",
  validTo: "2026-12-31T00:00:00Z",
  grantorNote: "파트너 체험",
};

function fill(scope: HTMLElement, label: RegExp, value: string) {
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  jest.clearAllMocks();
  api.listInquiries.mockResolvedValue([INQUIRY]);
  api.listContracts.mockResolvedValue([CONTRACT]);
  api.listEntitlements.mockResolvedValue([ENTITLEMENT]);
});

it("플랫폼 관리자가 아니면(403) 그렇다고 알린다", async () => {
  api.listInquiries.mockRejectedValue(new ApiRequestError({ status: 403, code: "AUTH-003", apiMessage: "x" }));
  render(<AdminConsole />);
  expect(await screen.findByRole("alert")).toHaveTextContent("플랫폼 관리자만 쓸 수 있어요.");
});

it("문의 상태를 바꾸고 담당 메모를 남긴다", async () => {
  api.updateInquiry.mockImplementation(async (_id: string, patch: object) => ({ ...INQUIRY, ...patch }));
  render(<AdminConsole />);
  expect(await screen.findByText("참가자 휴대폰 · 현장 부스")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("상태"), { target: { value: "CONTACTED" } });
  await waitFor(() => expect(api.updateInquiry).toHaveBeenCalledWith("Iq1", { status: "CONTACTED" }));

  fireEvent.change(screen.getByLabelText("담당 메모"), { target: { value: "12/5 견적 요청" } });
  fireEvent.click(screen.getByRole("button", { name: "메모 저장" }));
  await waitFor(() => expect(api.updateInquiry).toHaveBeenLastCalledWith("Iq1", { assigneeNote: "12/5 견적 요청" }));
});

it("문의에서 계약을 만들면 계약자 이름을 채운 초안 칸을 열고, 한국 시간으로 보낸다", async () => {
  api.createContract.mockResolvedValue({ ...CONTRACT, contractId: "Ct2" });
  render(<AdminConsole />);
  fireEvent.click(await screen.findByRole("button", { name: "계약 만들기" }));

  const form = await screen.findByRole("form", { name: "새 계약" });
  expect(within(form).getByLabelText(/계약자/)).toHaveValue("김하루");
  fill(form, /공간 ID/, "Ws1");
  fill(form, /^시작/, "2026-11-01T00:00");
  fill(form, /^끝/, "2026-12-31T23:59");
  fill(form, /금액/, "300000");
  fill(form, /합성 한도/, "500");
  fireEvent.click(within(form).getByLabelText("고른 행사만"));
  fill(form, /행사 ID/, "Ev1, Ev2");
  fireEvent.click(within(form).getByRole("button", { name: "초안으로 만들기" }));

  await waitFor(() => expect(api.createContract).toHaveBeenCalled());
  expect(api.createContract.mock.calls[0][0]).toEqual({
    workspaceId: "Ws1",
    contractorName: "김하루",
    scope: "EVENT",
    eventIds: ["Ev1", "Ev2"],
    amount: 300000,
    currency: "KRW",
    startsAt: "2026-11-01T00:00:00+09:00",
    endsAt: "2026-12-31T23:59:00+09:00",
    entitlement: { composeQuota: 500, features: [] },
  });
});

it("초안 계약을 확인 뒤에 적용하고, 전이가 막히면(ENT-003) 목록을 다시 받는다", async () => {
  api.changeContractStatus.mockRejectedValueOnce(new ApiRequestError({ status: 409, code: "ENT-003", apiMessage: "x" }));
  render(<AdminConsole />);
  fireEvent.click(screen.getByRole("tab", { name: "계약" }));
  fireEvent.click(await screen.findByRole("button", { name: "적용하기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "적용하기" }));

  await waitFor(() => expect(api.changeContractStatus).toHaveBeenCalledWith("Ct1", "ACTIVE", expect.any(AbortSignal)));
  expect(await screen.findByText(/지금 상태에서는 바꿀 수 없어요/)).toBeInTheDocument();
  await waitFor(() => expect(api.listContracts).toHaveBeenCalledTimes(2));
});

it("수동 이용권은 사유가 있어야 주고, 회수는 영향을 본 뒤 사유와 함께 한다", async () => {
  api.grantEntitlement.mockResolvedValue({ ...ENTITLEMENT, entitlementId: "En2" });
  api.getEntitlementImpact.mockResolvedValue({ liveEvents: ["Ev9"], openReservations: 2 });
  api.revokeEntitlement.mockResolvedValue({ ...ENTITLEMENT, status: "REVOKED", revokeReason: "계약 해지" });
  render(<AdminConsole />);
  fireEvent.click(screen.getByRole("tab", { name: "이용권" }));

  fireEvent.click(await screen.findByRole("button", { name: "수동 이용권 주기" }));
  const form = screen.getByRole("form", { name: "수동 이용권 주기" });
  fill(form, /공간 ID/, "Ws1");
  fill(form, /^시작/, "2026-10-26T00:00");
  fill(form, /^끝/, "2026-11-26T00:00");
  fill(form, /합성 한도/, "50");
  const submit = within(form).getByRole("button", { name: "이용권 주기" });
  expect(submit).toBeDisabled();
  fill(form, /부여 사유/, "파트너 체험 1개월");
  fireEvent.click(submit);
  await waitFor(() =>
    expect(api.grantEntitlement).toHaveBeenCalledWith({
      workspaceId: "Ws1",
      grantorNote: "파트너 체험 1개월",
      validFrom: "2026-10-26T00:00:00+09:00",
      validTo: "2026-11-26T00:00:00+09:00",
      terms: { composeQuota: 50, features: [] },
    }),
  );

  fireEvent.click(screen.getAllByRole("button", { name: "회수" })[1]);
  const panel = await screen.findByRole("group", { name: "이용권 회수" });
  expect(await within(panel).findByText(/운영 중 행사 1개\(Ev9\) · 아직 끝나지 않은 합성 2건/)).toBeInTheDocument();
  const revoke = within(panel).getByRole("button", { name: "회수하기" });
  expect(revoke).toBeDisabled();
  fireEvent.change(within(panel).getByLabelText(/회수 사유/), { target: { value: "계약 해지" } });
  fireEvent.click(revoke);
  await waitFor(() => expect(api.revokeEntitlement).toHaveBeenCalledWith("En1", "계약 해지"));
  expect(await screen.findByText("회수됨")).toBeInTheDocument();
});

// 계약 대상은 ID 를 손으로 적지 않고 찾아 고른다. 행사 범위면 그 행사의 공간 ID 도 함께 채운다.
it("행사를 찾아 고르면 행사 ID 와 그 공간 ID 를 채운다(두 글자 미만은 찾지 않는다)", async () => {
  api.searchEvents.mockResolvedValue([
    { eventId: "Ev7", slug: "wedding-1205", name: "민지 ♥ 준호", status: "LIVE", workspaceId: "Ws9", workspaceName: "웨딩홀 A", createdAt: "x" },
  ]);
  render(<AdminConsole />);
  fireEvent.click(screen.getByRole("tab", { name: "계약" }));
  fireEvent.click(await screen.findByRole("button", { name: "새 계약" }));
  const form = screen.getByRole("form", { name: "새 계약" });
  fireEvent.click(within(form).getByLabelText("고른 행사만"));

  const search = within(form).getByLabelText("행사 찾기");
  fireEvent.change(search, { target: { value: "웨" } });
  expect(within(form).getAllByRole("button", { name: "찾기" }).at(-1)).toBeDisabled();
  fireEvent.change(search, { target: { value: "웨딩" } });
  fireEvent.keyDown(search, { key: "Enter" });

  fireEvent.click(await within(form).findByRole("button", { name: /민지 ♥ 준호/ }));
  expect(api.searchEvents).toHaveBeenCalledWith("웨딩");
  expect(within(form).getByLabelText(/공간 ID/)).toHaveValue("Ws9");
  expect(within(form).getByLabelText(/^행사 ID/)).toHaveValue("Ev7");
  expect(api.createContract).not.toHaveBeenCalled();
});

it("PortOne 근거가 있는 계약은 결제 확인 여부를 보여 준다", async () => {
  api.listContracts.mockResolvedValue([
    { ...CONTRACT, paymentEvidence: { kind: "PORTONE", reference: "pay_1" }, paymentVerifiedAt: "2026-10-26T03:00:00Z" },
    { ...CONTRACT, contractId: "Ct3", paymentEvidence: { kind: "PORTONE", reference: "pay_2" } },
  ]);
  render(<AdminConsole />);
  fireEvent.click(screen.getByRole("tab", { name: "계약" }));
  expect(await screen.findByText(/pay_1 · 결제 확인됨/)).toBeInTheDocument();
  expect(screen.getByText(/pay_2 · 결제 확인 전/)).toBeInTheDocument();
});

// Codex 리뷰(#546): 메모를 적고 저장 전에 상태를 바꿔도 적던 메모가 사라지면 안 된다.
it("상태를 바꿔도 저장하지 않은 담당 메모는 그대로 둔다", async () => {
  api.updateInquiry.mockImplementation(async (_id: string, patch: object) => ({ ...INQUIRY, ...patch }));
  render(<AdminConsole />);
  await screen.findByText("참가자 휴대폰 · 현장 부스");

  fireEvent.change(screen.getByLabelText("담당 메모"), { target: { value: "견적 초안 작성 중" } });
  fireEvent.change(screen.getByLabelText("상태"), { target: { value: "CONTACTED" } });
  await waitFor(() => expect(api.updateInquiry).toHaveBeenCalledWith("Iq1", { status: "CONTACTED" }));

  await waitFor(() => expect(screen.getByLabelText("상태")).toHaveValue("CONTACTED"));
  expect(screen.getByLabelText("담당 메모")).toHaveValue("견적 초안 작성 중");
  expect(screen.getByRole("button", { name: "메모 저장" })).toBeInTheDocument();
});

// Codex 리뷰(#546): 숫자 칸의 지수 표기를 parseInt 로 읽으면 1e6 원이 1 원이 된다.
it("금액·한도의 지수 표기를 그대로 숫자로 보낸다", async () => {
  api.createContract.mockResolvedValue({ ...CONTRACT, contractId: "Ct9" });
  render(<AdminConsole />);
  fireEvent.click(screen.getByRole("tab", { name: "계약" }));
  fireEvent.click(await screen.findByRole("button", { name: "새 계약" }));
  const form = screen.getByRole("form", { name: "새 계약" });
  fill(form, /공간 ID/, "Ws1");
  fill(form, /계약자/, "하루컷 팬클럽");
  fill(form, /^시작/, "2026-11-01T00:00");
  fill(form, /^끝/, "2026-12-31T23:59");
  fill(form, /금액/, "1e6");
  fill(form, /합성 한도/, "5e2");
  fireEvent.click(within(form).getByRole("button", { name: "초안으로 만들기" }));
  await waitFor(() => expect(api.createContract).toHaveBeenCalled());
  expect(api.createContract.mock.calls[0][0]).toMatchObject({ amount: 1000000, entitlement: { composeQuota: 500 } });
});
