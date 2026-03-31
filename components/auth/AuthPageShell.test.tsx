import { render, screen } from "@testing-library/react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

const mockPageHeader = jest.fn();

jest.mock("@/components/layout/PageHeader", () => ({
  PageHeader: (props: unknown) => {
    mockPageHeader(props);
    return <div data-testid="page-header" />;
  },
}));

describe("AuthPageShell", () => {
  beforeEach(() => {
    mockPageHeader.mockClear();
  });

  test("pins the auth-page brand link to the landing page", () => {
    render(
      <AuthPageShell title="로그인" description="설명">
        <div>content</div>
      </AuthPageShell>,
    );

    expect(screen.getByTestId("page-header")).toBeInTheDocument();
    expect(mockPageHeader).toHaveBeenCalledWith(
      expect.objectContaining({
        brandHref: "/",
      }),
    );
  });
});
