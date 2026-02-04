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
import { toCreateFrameRequest } from "@/lib/frameApi";
import { api } from "@/lib/api";
import { useThemeSession } from "@/lib/themeSessionStore";
import { useThemeDraftStore } from "@/lib/themeDraftStore";

export function ThemeEditorPage({ frameId }: { frameId: FrameId }) {
  const router = useRouter();
  const setFrameId = useThemeEditorStore((s) => s.setFrameId);
  const exportJson = useThemeEditorStore((s) => s.exportJson);
  const importJson = useThemeEditorStore((s) => s.importJson);
  const resetPhotos = useThemeEditorStore((s) => s.resetPhotos);
  const addDraft = useThemeDraftStore((s) => s.addDraft);
  const { draftId } = useThemeSession();
  const draft = useThemeDraftStore((s) =>
    draftId ? s.drafts.find((d) => d.id === draftId) : undefined,
  );

  useEffect(() => {
    setFrameId(frameId);
  }, [frameId, setFrameId]);

  // 선택된 저장본이 있으면 불러오기
  useEffect(() => {
    if (draft && draft.data.frameId === frameId) {
      importJson(draft.data);
    }
  }, [draft, frameId, importJson]);

  useEffect(() => {
    return () => {
      resetPhotos();
    };
  }, [resetPhotos]);

  const onDone = async () => {
    const state = useThemeEditorStore.getState();
    const hiddenCount = state.components.filter((c) => c.hidden).length;
    if (hiddenCount > 0) {
      alert("숨겨진 레이어가 있어요.");
    }

    const json = exportJson();
    if (!json) return;

    const body = toCreateFrameRequest(json, {
      title: "테스트",
      description: "임시",
      previewKey: "some-preview-key",
    });

    await api.post("/api/auth/user/frame", body);
    addDraft(json);
    router.push("/home");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-4 lg:gap-6">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              harucut
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
                router.push("/theme");
              }}
            >
              프레임 선택으로 돌아가기
            </Link>
            <button
              type="button"
              onClick={onDone}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              저장
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:auto-rows-min">
          <div className="lg:col-start-2 lg:row-start-1 min-w-0">
            <AssetPanel />
          </div>

          <div className="lg:col-start-1 lg:row-start-1 lg:row-span-3">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">미리보기</p>
                <p className="text-[11px] text-zinc-500">
                  스티커 & 사진 혹은 글/투명 배경을 조합해보세요.
                </p>
              </div>

              <div className="h-[330px] flex items-center justify-center">
                <CanvasStage />
              </div>
            </section>
          </div>

          <div className="lg:col-start-2 lg:row-start-2">
            <LayersPanel />
          </div>

          <div className="lg:col-start-2 lg:row-start-3">
            <InspectorPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
