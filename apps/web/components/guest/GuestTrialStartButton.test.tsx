import { render, screen } from "@testing-library/react";
import { GUEST_TRIAL_CTA_LABEL } from "@harucut/shared";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";

test("체험 CTA는 사전 인증 요청 없이 일반 링크로 진입한다", () => {
  render(<GuestTrialStartButton />);
  expect(screen.getByRole("link", { name: GUEST_TRIAL_CTA_LABEL }))
    .toHaveAttribute("href", "/shoot/start");
});
