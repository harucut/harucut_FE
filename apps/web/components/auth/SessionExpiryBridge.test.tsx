/**
 * 하드 만료를 받았을 때 **말없이 화면을 갈아치우지 않는다**를 고정한다.
 *
 * 예전에는 `router.replace('/login?...')` 였다. 촬영 도중 그것을 맞으면 이유도 못 듣고,
 * 로그인이 문서를 새로 받는 바람에 메모리에 있던 촬영본이 사라졌다. 되돌아갈 히스토리
 * 항목도 `replace` 가 지웠다. 그래서 여기서 보는 것은 둘이다 —
 * 이동은 하지 않는다는 것과, 안내가 원래 화면으로 돌아올 주소를 들고 있다는 것.
 */
import { render } from "@testing-library/react";
import { SessionExpiryBridge } from "@/components/auth/SessionExpiryBridge";
import type { GuestNoticeState } from "@/lib/guestTrialStore";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetNotice = jest.fn();

let mockPathname = "/shoot/result";
let mockAccessMode: "guest" | "member" = "member";
/** 브리지가 clientApi 에 등록한 만료 핸들러. 테스트가 직접 부른다. */
let expiredHandler: (() => void) | null = null;

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock("@/lib/clientApi", () => ({
  registerSessionExpiredHandler: (handler: (() => void) | null) => {
    expiredHandler = handler;
  },
}));

// 개발 우회가 켜진 머신(.env.local)에서도 같은 것을 보게 값을 고정한다.
jest.mock("@/lib/devAuthBypass", () => ({ DEV_AUTH_BYPASS: false }));

jest.mock("@/lib/guestTrialStore", () => ({
  useGuestTrialStore: (
    selector: (state: {
      accessMode: string;
      setNotice: (notice: GuestNoticeState) => void;
    }) => unknown,
  ) => selector({ accessMode: mockAccessMode, setNotice: mockSetNotice }),
}));

function expire() {
  expiredHandler?.();
}

function lastNotice(): GuestNoticeState {
  return mockSetNotice.mock.calls.at(-1)?.[0] as GuestNoticeState;
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockSetNotice.mockClear();
  mockPathname = "/shoot/result";
  mockAccessMode = "member";
  expiredHandler = null;
  window.history.replaceState({}, "", "/shoot/result");
});

test("촬영 화면에서 만료되면 이동하지 않고 이유를 먼저 말한다", () => {
  render(<SessionExpiryBridge />);
  expire();

  // 화면을 뺏지 않는다 — 촬영본은 아직 이 문서의 메모리에만 있다.
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();

  const notice = lastNotice();
  expect(notice.title).toBe("로그인이 풀렸어요");
  expect(notice.actions.map((action) => action.id)).toEqual([
    "go-login",
    "dismiss",
  ]);
});

test("안내의 로그인 버튼은 쿼리까지 그대로인 원래 화면으로 돌아온다", () => {
  window.history.replaceState({}, "", "/shoot/result?event=%EC%97%AC%EB%A6%84");
  render(<SessionExpiryBridge />);
  expire();

  const loginAction = lastNotice().actions.find(
    (action) => action.id === "go-login",
  );
  expect(loginAction?.href).toBe(
    `/login?redirectTo=${encodeURIComponent("/shoot/result?event=%EC%97%AC%EB%A6%84")}`,
  );
});

test("같은 화면에서 만료가 여러 번 와도 한 번만 묻는다", () => {
  // 만료는 실패한 요청마다 온다. 닫은 안내가 곧바로 되살아나면 화면을 못 쓴다.
  render(<SessionExpiryBridge />);
  expire();
  expire();
  expire();

  expect(mockSetNotice).toHaveBeenCalledTimes(1);
});

test("게스트 체험 중에는 아무것도 하지 않는다", () => {
  mockAccessMode = "guest";
  render(<SessionExpiryBridge />);
  expire();

  expect(mockSetNotice).not.toHaveBeenCalled();
});

test("보호 경로가 아니면 아무것도 하지 않는다", () => {
  mockPathname = "/";
  render(<SessionExpiryBridge />);
  expire();

  expect(mockSetNotice).not.toHaveBeenCalled();
});
