"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { BACKGROUND_COLORS } from "@/constants/colors";
import { CanvasStage } from "@/components/theme/editor/canvas/CanvasStage";
import { AssetPanel } from "@/components/theme/editor/AssetPanel";
import { LayersPanel } from "@/components/theme/editor/LayersPanel";
import { InspectorPanel } from "@/components/theme/editor/InspectorPanel";
import { clientApi } from "@/lib/clientApi";
import { toCreateFrameRequest } from "@/lib/frameApi";
import { uploadToS3WithPresigned } from "@/lib/presignedUploadApi";
import { renderThemePreviewPng } from "@/lib/canvas/renderThemePreview";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import { useThemeSession } from "@/lib/themeSessionStore";
import { useThemeDraftStore } from "@/lib/themeDraftStore";

export function ThemeEditorPage({ frameId }: { frameId: FrameId }) {
  const router = useRouter();
  const setFrameId = useThemeEditorStore((s) => s.setFrameId);
  const exportJson = useThemeEditorStore((s) => s.exportJson);
  const importJson = useThemeEditorStore((s) => s.importJson);
  const resetPhotos = useThemeEditorStore((s) => s.resetPhotos);
  const backgroundColor = useThemeEditorStore((s) => s.backgroundColor);
  const setBackgroundColor = useThemeEditorStore((s) => s.setBackgroundColor);
  const addDraft = useThemeDraftStore((s) => s.addDraft);
  const updateDraft = useThemeDraftStore((s) => s.updateDraft);
  const { draftId } = useThemeSession();
  const [isSaving, setIsSaving] = useState(false);
  const draft = useThemeDraftStore((s) =>
    draftId ? s.drafts.find((d) => d.id === draftId) : undefined,
  );

  // 프레임 변경 시 에디터 상태 초기화
  useEffect(() => {
    setFrameId(frameId);
  }, [frameId, setFrameId]);

  // 선택된 저장본이 있으면 불러오기
  useEffect(() => {
    if (draft && draft.data.frameId === frameId) {
      importJson(draft.data);
    }
  }, [draft, frameId, importJson]);

  // 언마운트 시 업로드 이미지 메모리 정리
  useEffect(() => {
    return () => {
      resetPhotos();
    };
  }, [resetPhotos]);

  // 저장: JSON 내보내기 → Draft 저장
  const onDone = async () => {
    if (isSaving) return;
    // 숨김 레이어가 있으면 경고 (서버에는 제외됨)
    const state = useThemeEditorStore.getState();
    const hiddenCount = state.components.filter((c) => c.hidden).length;
    if (hiddenCount > 0) {
      alert("숨겨진 레이어가 있어요.");
    }

    const themeJson = exportJson();
    if (!themeJson) return;

    setIsSaving(true);
    try {
      const previewBlob = await renderThemePreviewPng(themeJson);

      // const localUrl = URL.createObjectURL(previewBlob);
      // const a = document.createElement("a");
      // a.href = localUrl;
      // a.download = "theme-preview-local.png";
      // a.click();
      // URL.revokeObjectURL(localUrl);
      // return; // 여기서 종료하면 통신 없이 이미지 확인 가능

      const previewFile = new File(
        [previewBlob],
        `theme-preview-${Date.now()}.png`,
        { type: "image/png" },
      );
      const { key: previewKey } = await uploadToS3WithPresigned({
        file: previewFile,
        type: "PREVIEW",
        isTemp: false,
      });

      const body = toCreateFrameRequest(themeJson, {
        title: "테마 프레임",
        description: "프레임 꾸미기 저장",
        previewKey,
      });
      await clientApi.post("/api/client/user/frame", body);
    } catch (e) {
      console.error(e);
      alert("저장에 실패했습니다.");
      setIsSaving(false);
      return;
    }

    if (draft?.id) {
      updateDraft(draft.id, themeJson);
    } else {
      addDraft(themeJson);
    }
    setIsSaving(false);
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
              disabled={isSaving}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:auto-rows-min">
          <div className="lg:col-start-2 lg:row-start-1 min-w-0">
            <AssetPanel />
          </div>

          <div className="lg:col-start-2 lg:row-start-2">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold">배경색</p>
              <div className="flex flex-wrap gap-2">
                {BACKGROUND_COLORS.map((color) => {
                  const selected = backgroundColor === color.value;
                  return (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setBackgroundColor(color.value)}
                      className={`h-8 min-w-16 rounded-lg border px-2 text-[11px] ${
                        selected
                          ? "border-white text-white"
                          : "border-zinc-700 text-zinc-300"
                      }`}
                      style={{ backgroundColor: `#${color.value}` }}
                    >
                      {color.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={`#${backgroundColor}`}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-zinc-700 bg-zinc-950"
                />
                <input
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-9 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-200"
                  placeholder="ffffff"
                />
              </div>
            </section>
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

          <div className="lg:col-start-2 lg:row-start-3">
            <LayersPanel />
          </div>

          <div className="lg:col-start-2 lg:row-start-4">
            <InspectorPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
