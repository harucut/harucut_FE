import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CloneEventForm } from "@/components/studio/CloneEventForm";

const mockClone = jest.fn();
jest.mock("@/lib/studio/photosApi", () => ({ cloneEvent: (...a: unknown[]) => mockClone(...a) }));

it("새 주소 규칙에 맞아야 복제하고, 만든 행사를 넘긴다", async () => {
  const onCloned = jest.fn();
  mockClone.mockResolvedValue({ eventId: "Ev2" });
  render(<CloneEventForm eventId="Ev1" defaultName="결혼식 복사본" onCancel={jest.fn()} onCloned={onCloned} />);

  fireEvent.change(screen.getByLabelText("새 참가 주소"), { target: { value: "ab" } });
  expect(screen.getByRole("button", { name: "복제하기" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("새 참가 주소"), { target: { value: "Wedding-1103" } });
  fireEvent.click(screen.getByRole("button", { name: "복제하기" }));

  await waitFor(() => expect(mockClone).toHaveBeenCalledWith("Ev1", "결혼식 복사본", "wedding-1103"));
  expect(onCloned).toHaveBeenCalledWith({ eventId: "Ev2" });
});
