import { render, screen } from "@testing-library/react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

describe("AuthPageShell", () => {
  test("renders the title and pins the brand link to the landing page", () => {
    render(
      <AuthPageShell title="로그인" description="설명">
        <div>content</div>
      </AuthPageShell>,
    );

    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();

    const homeLinks = screen.getAllByRole("link", { name: "하루컷 홈" });
    expect(homeLinks.length).toBeGreaterThan(0);
    homeLinks.forEach((link) => expect(link).toHaveAttribute("href", "/"));
  });
});

/*
  폰은 앱의 다른 흐름 화면과 같은 머리 줄이다 — 왼쪽 뒤로가기, 가운데 제목(2026-11-14).
  제목은 하나만 둔다. 넓은 화면은 같은 제목을 왼쪽 큰 글씨로 보인다(CSS).
*/
test("뒤로가기는 받은 곳으로 가고, 제목은 하나다", () => {
  render(
    <AuthPageShell title="회원가입" backHref="/login?redirectTo=%2Fhistory" backLabel="로그인으로">
      <div>content</div>
    </AuthPageShell>,
  );

  expect(screen.getAllByRole("heading", { name: "회원가입" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "로그인으로" })).toHaveAttribute("href", "/login?redirectTo=%2Fhistory");
});

test("뒤로가기를 정하지 않으면 첫 화면으로 간다(로그인)", () => {
  render(
    <AuthPageShell title="로그인">
      <div>content</div>
    </AuthPageShell>,
  );

  expect(screen.getByRole("link", { name: "처음 화면으로" })).toHaveAttribute("href", "/");
});
