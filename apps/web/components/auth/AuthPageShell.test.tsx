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

    const homeLinks = screen.getAllByRole("link", { name: /Harucut home/i });
    expect(homeLinks.length).toBeGreaterThan(0);
    homeLinks.forEach((link) => expect(link).toHaveAttribute("href", "/"));
  });
});
