import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StoreBuyButton, StoreRestoreButton } from "@/components/subscription/StoreSubscriptionActions";

const shell = { native: false, supports: false };
const mockBuy = jest.fn();
const mockRestore = jest.fn();
const mockProducts = jest.fn();

// 앱 결제를 연 상태로 본다(기본값은 사업 결정 전이라 꺼져 있다).
jest.mock("@harucut/shared", () => ({ ...jest.requireActual("@harucut/shared"), STORE_PURCHASES_ENABLED: true }));
jest.mock("@/lib/nativeBridge", () => ({
  isNativeShell: () => shell.native,
  supportsStorePurchase: () => shell.supports,
  nativeStoreProducts: (...a: unknown[]) => mockProducts(...a),
}));
jest.mock("@/lib/storePurchase", () => ({
  buyPlusInApp: () => mockBuy(),
  restoreInApp: () => mockRestore(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  shell.native = false;
  shell.supports = false;
  mockProducts.mockResolvedValue({ ok: true, value: [{ productId: "harucut.plus.monthly", displayPrice: "₩3,900", title: "플러스" }] });
});

// 스토어 결제는 웹 결제로 우회하지 않는다(R5 12절) — 브라우저에서는 대체 내용만, 구버전 셸에는 업데이트 안내만.
it("브라우저에서는 대체 내용을, 구버전 셸에서는 업데이트 안내를 보인다", async () => {
  const { unmount } = render(<StoreBuyButton fallback={<p>결제 준비 중</p>} />);
  expect(await screen.findByText("결제 준비 중")).toBeInTheDocument();
  unmount();

  shell.native = true;
  render(<StoreBuyButton fallback={<p>결제 준비 중</p>} />);
  expect(await screen.findByText(/앱을 업데이트하면/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("앱에서는 스토어 가격으로 구독 버튼을 보이고, 마치면 알린다", async () => {
  shell.native = true;
  shell.supports = true;
  const sub = { planTier: "PLUS", status: "ACTIVE" };
  mockBuy.mockResolvedValue({ kind: "done", subscription: sub });
  const onDone = jest.fn();
  render(<StoreBuyButton onDone={onDone} />);

  fireEvent.click(await screen.findByRole("button", { name: "앱에서 구독하기 · ₩3,900" }));
  expect(await screen.findByRole("status")).toHaveTextContent("플러스를 시작했어요.");
  expect(onDone).toHaveBeenCalledWith(sub);
});

it("결제 창을 닫으면 아무 안내도 없고, 복원이 실패하면 문구를 보인다", async () => {
  shell.native = true;
  shell.supports = true;
  mockBuy.mockResolvedValue({ kind: "cancelled" });
  const { unmount } = render(<StoreBuyButton />);
  fireEvent.click(await screen.findByRole("button", { name: /앱에서 구독하기/ }));
  await waitFor(() => expect(mockBuy).toHaveBeenCalled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  unmount();

  mockRestore.mockResolvedValue({ kind: "error", message: "이 스토어 계정에 복원할 구독이 없어요." });
  render(<StoreRestoreButton />);
  fireEvent.click(await screen.findByRole("button", { name: "구매 복원" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("이 스토어 계정에 복원할 구독이 없어요.");
});
