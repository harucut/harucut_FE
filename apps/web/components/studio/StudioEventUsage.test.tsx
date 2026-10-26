import { render, screen } from "@testing-library/react";
import { StudioEventUsage } from "@/components/studio/StudioEventUsage";
import type { EventUsage } from "@/lib/studio/usageApi";

const NOW = Date.parse("2026-10-26T00:00:00Z");

function usage(overrides: Partial<EventUsage> = {}): EventUsage {
  return {
    entitlement: {
      scope: "EVENT",
      validFrom: "2026-10-01T00:00:00Z",
      validTo: "2026-12-31T00:00:00Z",
      features: ["CUSTOM_THEME", "BULK_DOWNLOAD"],
    },
    composeQuota: 500,
    used: 120,
    reserved: 3,
    remaining: 377,
    retentionDays: 30,
    maxBoothDevices: 2,
    ...overrides,
  };
}

it("남은 촬영과 기간·범위·기능을 보여 준다", () => {
  render(<StudioEventUsage usage={usage()} error={null} now={NOW} onRefresh={jest.fn()} />);
  expect(screen.getByText("377")).toBeInTheDocument();
  expect(screen.getByRole("meter", { name: "합성 사용량" })).toHaveAttribute("aria-valuenow", "123");
  expect(screen.getByText("완성 120장 · 만드는 중 3장. 만들지 못한 사진은 세지 않아요.")).toBeInTheDocument();
  expect(screen.getByText("이 행사")).toBeInTheDocument();
  expect(screen.getByText("행사 화면 디자인 · 사진 묶음 받기")).toBeInTheDocument();
  expect(screen.queryByText(/증설·연장 문의/)).not.toBeInTheDocument();
});

it("이용권이 없으면 게시에 필요하다고 알리고 문의로 잇는다", () => {
  render(
    <StudioEventUsage
      usage={{ composeQuota: 0, used: 0, reserved: 0, remaining: 0 }}
      error={null}
      now={NOW}
      onRefresh={jest.fn()}
    />,
  );
  expect(screen.getByText("아직 이 행사에 적용된 이용권이 없어요.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "도입 문의하기" })).toHaveAttribute("href", "/enterprise#inquiry");
});

// R5 「갱신·증설 문의와 만료 전 안내」
it("남은 촬영이 적거나 기간이 곧 끝나면 미리 알린다", () => {
  const { rerender } = render(
    <StudioEventUsage usage={usage({ remaining: 20 })} error={null} now={NOW} onRefresh={jest.fn()} />,
  );
  expect(screen.getByText(/남은 촬영이 얼마 없어요/)).toBeInTheDocument();

  rerender(
    <StudioEventUsage
      usage={usage({ entitlement: { ...usage().entitlement!, validTo: "2026-10-30T00:00:00Z" } })}
      error={null}
      now={NOW}
      onRefresh={jest.fn()}
    />,
  );
  expect(screen.getByText(/이용권이 2026년 10월 30일에 끝나요/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "증설·연장 문의" })).toBeInTheDocument();
});
