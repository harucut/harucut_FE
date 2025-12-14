"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { useUploadSession } from "@/lib/uploadSessionStore";
import { FramePicker } from "@/components/frame/FramePicker";

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
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              RECORDAY
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              업로드 · 프레임 선택
            </h1>
          </div>
          <Link
            href="/home"
            className="text-xs text-zinc-400 underline underline-offset-4"
          >
            홈으로
          </Link>
        </header>

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
