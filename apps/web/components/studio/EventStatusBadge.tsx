import type { StudioEvent } from "@/lib/studio/studioApi";

/**
 * 운영자가 읽는 행사 상태. LIVE 하나를 「운영 중 / 일시 중지 / 촬영 대기」로 나눈다 —
 * 게시했어도 촬영 기간 밖이거나 중지했으면 참가자는 찍을 수 없다(서버 captureOpen 이 진실).
 */
export function eventStatusLabel(event: Pick<StudioEvent, "status" | "paused" | "captureOpen">): string {
  switch (event.status) {
    case "DRAFT":
      return "초안";
    case "LIVE":
      if (event.paused) return "일시 중지";
      return event.captureOpen ? "운영 중" : "촬영 대기";
    case "CAPTURE_CLOSED":
      return "촬영 종료";
    case "ARCHIVED":
      return "보관 종료";
    default:
      return "확인 필요";
  }
}

export function EventStatusBadge({ event }: { event: Pick<StudioEvent, "status" | "paused" | "captureOpen"> }) {
  const live = event.status === "LIVE" && !event.paused && event.captureOpen;
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
        live
          ? "border-(--hc-accent-soft-border) bg-(--hc-accent-soft-bg) text-(--hc-accent-soft-text)"
          : "border-(--hc-border) text-(--hc-muted)"
      }`}
    >
      {eventStatusLabel(event)}
    </span>
  );
}
