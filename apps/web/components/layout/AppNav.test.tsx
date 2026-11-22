/**
 * 개인 화면과 행사 운영은 서로 섞지 않는다(2026-11-14).
 *  - 개인 화면의 상단 메뉴에는 행사를 맡은 계정이어도 「행사 운영」이 없다 — 가는 길은 MY 의 한 줄뿐이다.
 *  - 행사 운영·플랫폼 관리 화면에서는 개인 메뉴(기록·요금제)를 내밀지 않고, 로고가 그 화면의 첫 화면으로 간다.
 */
import { render, screen } from "@testing-library/react";
import { AppNav } from "@/components/layout/AppNav";

let mockPathname = "/home";
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname }));
jest.mock("@/lib/storePurchase", () => ({ resumeUnfinishedPurchases: jest.fn(async () => undefined) }));
jest.mock("@/lib/pushDevices", () => ({ syncPushDevice: jest.fn(async () => undefined) }));
jest.mock("@/hooks/useStudioAccess", () => ({ useStudioAccess: () => true }));

const navLinks = () => screen.getAllByRole("link").map((link) => [link.textContent || link.getAttribute("aria-label"), link.getAttribute("href")]);

it("개인 화면의 메뉴에는 행사를 맡은 계정이어도 행사 운영이 없다", () => {
  mockPathname = "/home";
  render(<AppNav />);

  expect(screen.queryByRole("link", { name: "행사 운영" })).not.toBeInTheDocument();
  expect(navLinks()).toEqual(
    expect.arrayContaining([
      ["홈", "/home"],
      ["기록", "/history"],
      ["프레임", "/theme"],
      ["요금제", "/pricing"],
      ["마이페이지", "/mypage"],
    ]),
  );
});

it.each([
  ["/studio/events/42", "행사 운영", "/studio"],
  ["/admin", "운영 관리", "/admin"],
])("%s 에서는 개인 메뉴 없이 그 화면만 두고, 로고도 그 첫 화면으로 간다", (path, label, href) => {
  mockPathname = path;
  render(<AppNav />);

  expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  expect(screen.queryByRole("link", { name: "기록" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "요금제" })).not.toBeInTheDocument();
  expect(document.querySelector('a[href="/home"]')).toBeNull();
});
