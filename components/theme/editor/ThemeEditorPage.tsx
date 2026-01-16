"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { CanvasStage } from "@/components/theme/editor/canvas/CanvasStage";
import { AssetPanel } from "@/components/theme/editor/AssetPanel";
import { LayersPanel } from "@/components/theme/editor/LayersPanel";
import { InspectorPanel } from "@/components/theme/editor/InspectorPanel";
import { useThemeEditorStore } from "@/lib/themeEditorStore";

export function ThemeEditorPage({ frameId }: { frameId: FrameId }) {
  const router = useRouter();
  const setFrameId = useThemeEditorStore((s) => s.setFrameId);
  const exportJson = useThemeEditorStore((s) => s.exportJson);
  const resetPhotos = useThemeEditorStore((s) => s.resetPhotos);

  useEffect(() => {
    setFrameId(frameId);
  }, [frameId, setFrameId]);

  useEffect(() => {
    return () => {
      resetPhotos();
    };
  }, [resetPhotos]);

  const onDone = async () => {
    const json = exportJson();
    if (!json) return;

    console.log(json);
    await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    alert("완료! JSON이 클립보드에 복사됐어.");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-md flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              RECORDAY
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              프레임 꾸미기
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/theme"
              className="text-xs text-zinc-400 underline underline-offset-4"
              onClick={() => {
                useThemeEditorStore.getState().reset();
                router.push("/theme/frame");
              }}
            >
              프레임 다시
            </Link>
            <button
              type="button"
              onClick={onDone}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              완료
            </button>
          </div>
        </header>

        <AssetPanel />

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">미리보기</p>
            <p className="text-[11px] text-zinc-500">
              드래그 이동 · 핸들로 크기/회전 · 레이어로 순서 조절
            </p>
          </div>

          <div className="h-[330px] flex items-center justify-center">
            <CanvasStage />
          </div>
        </section>

        <LayersPanel />
        <InspectorPanel />
      </div>
    </main>
  );
}
