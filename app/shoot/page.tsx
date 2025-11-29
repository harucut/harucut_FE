"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";
import { useShootSession } from "@/lib/shootSessionStore";

export default function ShootPage() {
  const router = useRouter();
  const { frameId, setFrameId, resetShots } = useShootSession();

  const [selectedFrameId, setSelectedFrameId] = useState<FrameId>(
    frameId ?? "classic-4"
  );

  useEffect(() => {
    resetShots();
  }, [resetShots]);

  const handleConfirmFrame = () => {
    setFrameId(selectedFrameId);
    router.push("/shoot/capture");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              RECORDAY
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              사진 촬영 · 프레임 선택
            </h1>
          </div>
          <Link
            href="/home"
            className="text-xs text-zinc-400 underline underline-offset-4"
          >
            홈으로
          </Link>
        </header>

        <p className="text-xs text-zinc-500">
          1단계: 인생네컷 레이아웃을 먼저 골라주세요.
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-zinc-300">
            선택된 프레임 미리보기
          </h2>
          <div className="h-120 flex items-center justify-center">
            <FramePreview
              variant={selectedFrameId}
              selected
              className="w-full"
            />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-zinc-300 mb-1">
            프레임 선택
          </h3>
          <div className="flex flex-col gap-2">
            {FRAME_CONFIGS.map((frame) => {
              const isSelected = frame.id === selectedFrameId;
              return (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => setSelectedFrameId(frame.id)}
                  className={[
                    "flex items-center justify-between rounded-2xl border px-3 py-2 text-left transition-colors",
                    "bg-zinc-900/70",
                    isSelected
                      ? "border-emerald-400/80"
                      : "border-zinc-800 hover:border-zinc-600",
                  ].join(" ")}
                >
                  <div className="flex-1 pr-3">
                    <p className="text-[11px] font-medium text-zinc-100">
                      {frame.name}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {frame.description}
                    </p>
                  </div>
                  <div
                    className={[
                      "flex h-6 w-6 items-center justify-center rounded-full border text-[10px]",
                      isSelected
                        ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                        : "border-zinc-600 text-zinc-400",
                    ].join(" ")}
                  ></div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleConfirmFrame}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            이 프레임으로 촬영하기
          </button>
        </div>
      </div>
    </main>
  );
}
