import { render, screen } from "@testing-library/react";
import { ShootSessionBoundary } from "@/components/shoot/ShootSessionBoundary";
import { useShootSession } from "@/lib/shootSessionStore";

const mockReplace = jest.fn();
let mockPath = "/create/select";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/lib/shootSessionPersistence", () => ({
  initializeShootSession: () => Promise.resolve(),
  useShootPersistence: () => ({ ready: true, error: false }),
}));

/*
  「최종적으로 완성되었을땐 다시 고르기를 막아야해」(2026-11-15). 완성 화면의 단추만 빼면 기기 뒤로가기·주소로
  여전히 고르기 화면에 닿았다. 끝난 촬영의 단계 화면은 그리지 않고 완성 화면으로 보낸다.
*/
describe("끝난 촬영", () => {
  const initial = useShootSession.getState();

  beforeEach(() => {
    mockReplace.mockClear();
  });

  afterEach(() => {
    useShootSession.setState(initial, true);
  });

  // 완성본이 어디에 있든(계정 기록·이 기기) 끝난 촬영이다.
  it.each([
    ["/create/capture", "account"],
    ["/create/select", "account"],
    ["/create/select", "device"],
  ] as const)("%s 에 오면(%s) 그리지 않고 완성 화면으로 보낸다", (path, completed) => {
    mockPath = path;
    useShootSession.setState({ completed });
    render(<ShootSessionBoundary><p>단계 화면</p></ShootSessionBoundary>);

    expect(screen.queryByText("단계 화면")).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith("/create/result");
  });

  it.each(["/create/result", "/create"])("%s 는 그대로 그린다", (path) => {
    mockPath = path;
    useShootSession.setState({ completed: "device" });
    render(<ShootSessionBoundary><p>화면</p></ShootSessionBoundary>);

    expect(screen.getByText("화면")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("끝나지 않은 촬영은 고르기 화면을 그대로 그린다", () => {
    mockPath = "/create/select";
    render(<ShootSessionBoundary><p>고르기</p></ShootSessionBoundary>);

    expect(screen.getByText("고르기")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
