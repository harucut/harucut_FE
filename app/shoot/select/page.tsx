"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useShootSession } from "@/lib/shootSessionStore";
import { type FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";

export default function SelectPage() {
  const router = useRouter();
  const { frameId, shots, selectedIndexes, toggleSelect, resetAll } =
    useShootSession();

  useEffect(() => {
    if (!frameId) {
      router.replace("/shoot");
      return;
    }
    if (!shots.length) {
      router.replace("/shoot/capture");
    }
  }, [frameId, shots.length, router]);

  const selectedImagesForFrame = useMemo(() => {
    if (!selectedIndexes.length) return [];

    return selectedIndexes
      .map((idx) => shots[idx])
      .filter((src): src is string => Boolean(src))
      .slice(0, 4);
  }, [selectedIndexes, shots]);

  const handleNext = () => {
    if (selectedIndexes.length !== 4) return;
    router.push("/shoot/result");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              RECORDAY
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              사진 선택 · 4장 고르기
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/shoot/capture"
              className="text-[11px] text-zinc-400 underline underline-offset-4"
            >
              다시 촬영
            </Link>
          </div>
        </header>

        {frameId && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-zinc-300">
              선택한 프레임 미리보기
            </h2>
            <div className="flex justify-center h-[330px]">
              <FramePreview
                variant={frameId as FrameId}
                images={selectedImagesForFrame}
              />
            </div>
            <p className="text-[10px] text-zinc-500 text-center">
              아래에서 사진을 고르면, 위 프레임에 선택 순서대로 채워져요.
            </p>
          </section>
        )}

        <p className="text-[11px] text-zinc-400">
          방금 촬영한 사진 {shots.length}장 중에서 최대 4장을 골라주세요.
        </p>

        <section className="space-y-2">
          {shots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-4 text-center text-[11px] text-zinc-500">
              촬영된 사진이 없어요. 다시 촬영해 주세요.
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {shots.map((src, index) => {
                const isSelected = selectedIndexes.includes(index);
                const order = selectedIndexes.indexOf(index) + 1;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => toggleSelect(index)}
                    className={[
                      "relative aspect-[3/4] overflow-hidden rounded-lg border bg-black",
                      isSelected
                        ? "border-emerald-400 ring-2 ring-emerald-400/60"
                        : "border-zinc-700",
                    ].join(" ")}
                  >
                    <img
                      src={src}
                      alt={`shot-${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-zinc-200">
                      #{index + 1}
                    </span>
                    {isSelected && (
                      <span className="pointer-events-none absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold text-zinc-950">
                        {order}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex flex-col">
            <span>선택된 사진 {selectedIndexes.length} / 4장</span>
            <button
              type="button"
              onClick={resetAll}
              className="mt-1 w-fit rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-900"
            >
              프레임 선택부터 다시 하기
            </button>
          </div>
          <button
            type="button"
            disabled={selectedIndexes.length !== 4}
            onClick={handleNext}
            className="rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            다음 단계로 (프레임 합성 예정)
          </button>
        </section>
      </div>
    </main>
  );
}
