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

// 한도 알림(ADR-0009 §4) — 확정 사용량이 처음 넘은 비율만 서버가 준다. 상시 캠페인은 끝나는 날이 없어 이것으로 증설 시점을 안다.
it("넘은 한도 알림을 비율과 시각으로 보여 주고, 없으면 그리지 않는다", () => {
  const { rerender } = render(
    <StudioEventUsage
      usage={usage({
        alerts: [
          { threshold: 80, reachedAt: "2026-10-20T05:03:00Z" },
          { threshold: 95, reachedAt: "2026-10-24T05:03:00Z" },
        ],
      })}
      error={null}
      now={NOW}
      onRefresh={jest.fn()}
    />,
  );
  expect(screen.getByText("한도 알림")).toBeInTheDocument();
  expect(screen.getByText(/한도의 80%에 닿았어요/)).toBeInTheDocument();
  expect(screen.getByText(/한도의 95%에 닿았어요/)).toBeInTheDocument();

  rerender(<StudioEventUsage usage={usage({ alerts: [] })} error={null} now={NOW} onRefresh={jest.fn()} />);
  expect(screen.queryByText("한도 알림")).not.toBeInTheDocument();
});

// 배분을 받은 행사(ADR-0009 §5)는 기업 총량이 먼저 끝나도 마감된다 — 관리자에게 둘 다 보이고, 적은 쪽으로 미리 알린다.
it("기업 총량을 함께 보이고, 총량이 배분보다 적게 남았으면 그것으로 미리 알린다", () => {
  const { rerender } = render(
    <StudioEventUsage
      usage={usage({ parent: { composeQuota: 2000, used: 1980, reserved: 0, remaining: 20 } })}
      error={null}
      now={NOW}
      onRefresh={jest.fn()}
    />,
  );
  expect(screen.getByText("기업 총량에서 이 행사에 배분")).toBeInTheDocument();
  expect(screen.getByText(/기업 총량 남은 촬영/)).toHaveTextContent("기업 총량 남은 촬영 20 / 2,000장");
  expect(screen.getByText(/총량을 다 쓰면 이 행사도 촬영이 마감돼요/)).toBeInTheDocument();
  expect(screen.getByText(/남은 촬영이 얼마 없어요/)).toBeInTheDocument();

  // 운영 담당·행사 고객에게는 parent 가 오지 않는다.
  rerender(<StudioEventUsage usage={usage()} error={null} now={NOW} onRefresh={jest.fn()} />);
  expect(screen.queryByText(/기업 총량/)).not.toBeInTheDocument();
});
