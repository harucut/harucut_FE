import { render, screen } from "@testing-library/react";
import { ServiceSurfaceOnly } from "@/components/layout/ServiceSurfaceOnly";

let mockPathname = "/home";
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

describe("ServiceSurfaceOnly", () => {
  it("개인 서비스 화면에서는 자식을 그린다", () => {
    mockPathname = "/home";
    render(<ServiceSurfaceOnly><p>회원 팝업</p></ServiceSurfaceOnly>);
    expect(screen.getByText("회원 팝업")).toBeInTheDocument();
  });

  // F48 — 만료된 회원 쿠키가 남아 있어도 행사·부스·결과 화면에 회원 팝업을 띄우지 않는다.
  it.each(["/e/wedding-0101", "/r", "/booth"])("%s 에서는 그리지 않는다", (path) => {
    mockPathname = path;
    render(<ServiceSurfaceOnly><p>회원 팝업</p></ServiceSurfaceOnly>);
    expect(screen.queryByText("회원 팝업")).not.toBeInTheDocument();
  });
});
