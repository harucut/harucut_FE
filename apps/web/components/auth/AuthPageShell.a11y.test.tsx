import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

describe("AuthPageShell accessibility", () => {
  test("has no obvious accessibility violations", async () => {
    const { container } = render(
      <AuthPageShell title="로그인" description="계정으로 계속 진행하세요">
        <form aria-label="로그인 폼">
          <label htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" />
          <button type="submit">계속</button>
        </form>
      </AuthPageShell>,
    );

    await expect(axe(container)).resolves.toHaveNoViolations();
  });
});
