"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FrameId } from "@/constants/frames";
import { FramePicker } from "@/components/frame/FramePicker";
import { useThemeSession } from "@/lib/themeSessionStore";
import { useThemeDraftStore } from "@/lib/themeDraftStore";
import { PageHeader } from "@/components/layout/PageHeader";

export default function ThemePage() {
  const router = useRouter();
  const { frameId, setFrameId, setDraftId, reset } = useThemeSession();
  const drafts = useThemeDraftStore((s) => s.drafts);

  const [selectedFrameId, setSelectedFrameId] = useState<FrameId>(
    frameId ?? "classic-4",
  );
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  useEffect(() => {
    reset();
  }, [reset]);

  const allowedDraftId =
    selectedDraftId &&
    drafts.some(
      (d) => d.id === selectedDraftId && d.frameId === selectedFrameId,
    )
      ? selectedDraftId
      : null;

  const handleConfirmFrame = () => {
    setFrameId(selectedFrameId);
    setDraftId(allowedDraftId);
    router.push("/theme/sticker");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-2 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader
          title="꾸미기 · 프레임 선택"
          backHref="/home"
          backLabel="처음으로"
          description={<>1단계: 원하는 프레임을 선택해주세요.</>}
        />
        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={setSelectedFrameId}
          onConfirm={handleConfirmFrame}
          confirmLabel="이 프레임으로 꾸미기"
          drafts={drafts}
          selectedDraftId={allowedDraftId}
          onSelectDraft={setSelectedDraftId}
        />
      </div>
    </main>
  );
}
