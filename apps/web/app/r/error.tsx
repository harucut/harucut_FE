"use client";

import { EventNeutralState } from "@/components/participation/EventNeutralState";

export default function EventError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EventNeutralState
      title="화면을 불러오지 못했어요"
      message="잠시 후 다시 시도해 주세요. 계속되면 행사 담당자에게 알려 주세요."
      actionLabel="다시 시도"
      onAction={reset}
    />
  );
}
