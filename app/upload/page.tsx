"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { useUploadSession } from "@/lib/uploadSessionStore";
import { FramePicker } from "@/components/frame/FramePicker";
import { PageHeader } from "@/components/layout/PageHeader";

export default function UploadFramePage() {
  const router = useRouter();
  const { frameId, setFrameId } = useUploadSession();

  const [selectedFrameId, setSelectedFrameId] = useState<FrameId>(
    frameId ?? "classic-4"
  );

  const handleConfirmFrame = () => {
    setFrameId(selectedFrameId);
    router.push("/upload/select");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-2 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader
          title="업로드 · 프레임 선택"
          backHref="/home"
          backLabel="홈으로"
          description={<>1단계: 인생네컷 레이아웃을 먼저 골라주세요.</>}
        />
        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={setSelectedFrameId}
          onConfirm={handleConfirmFrame}
          confirmLabel="이 프레임으로 업로드하기"
        />
      </div>
    </main>
  );
}
