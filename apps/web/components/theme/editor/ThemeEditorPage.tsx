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
import { toCreateFrameRequest, toThemeExportJson } from "@/lib/frameApi";
import {
  createFrame,
  deleteFrame,
  getFrame,
  updateFrame,
} from "@/lib/remoteFrameApi";
import {
  PRESIGNED_UPLOAD_TYPES,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";
import { renderThemePreviewPng } from "@/lib/canvas/renderThemePreview";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import { useThemeSession } from "@/lib/themeSessionStore";
import { useThemeDraftStore } from "@/lib/themeDraftStore";

export function ThemeEditorPage({ frameId }: { frameId: FrameId }) {
  const router = useRouter();
  const setFrameId = useThemeEditorStore((s) => s.setFrameId);
  const exportJson = useThemeEditorStore((s) => s.exportJson);
  const importJson = useThemeEditorStore((s) => s.importJson);
  const resetPhotos = useThemeEditorStore((s) => s.resetPhotos);
  const background = useThemeEditorStore((s) => s.background);
  const backgroundColor = useThemeEditorStore((s) => s.backgroundColor);
  const setBackgroundColor = useThemeEditorStore((s) => s.setBackgroundColor);
  const addDraft = useThemeDraftStore((s) => s.addDraft);
  const { remoteFrameId } = useThemeSession();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFrame, setIsLoadingFrame] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const hasRemoteLoadFailure = Boolean(remoteFrameId && loadError);
  const hasNonColorBackground = background.type !== "COLOR";

  useEffect(() => {
    setFrameId(frameId);
  }, [frameId, setFrameId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteFrame() {
      if (!remoteFrameId) {
        setLoadError(null);
        return;
      }

      setIsLoadingFrame(true);
      setLoadError(null);

      try {
        const remoteFrame = await getFrame(remoteFrameId);
        if (!cancelled) {
          importJson(toThemeExportJson(remoteFrame));
          setTitle(remoteFrame.title || "");
          setDescription(remoteFrame.description || "");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadError("저장한 프레임을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFrame(false);
        }
      }
    }

    loadRemoteFrame();

    return () => {
      cancelled = true;
    };
  }, [importJson, remoteFrameId]);

  useEffect(() => {
    if (remoteFrameId) return;

    setTitle("새 테마 프레임");
    setDescription("하루컷에서 직접 꾸민 나만의 프레임");
  }, [remoteFrameId]);

  useEffect(() => {
    return () => {
      resetPhotos();
    };
  }, [resetPhotos]);

  const onDone = async () => {
    if (isSaving || isLoadingFrame) return;
    if (hasRemoteLoadFailure) {
      alert("저장한 프레임을 불러오지 못했어 수정 저장을 막았습니다.");
      return;
    }

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
      const previewFile = new File(
        [previewBlob],
        `theme-preview-${Date.now()}.png`,
        { type: "image/png" },
      );
      const { key: previewKey } = await uploadToS3WithPresigned({
        file: previewFile,
        type: PRESIGNED_UPLOAD_TYPES.FRAME,
        isTemp: false,
      });

      const body = toCreateFrameRequest(themeJson, {
        title: title.trim() || "테마 프레임",
        description:
          description.trim() ||
          (remoteFrameId ? "프레임 꾸미기 수정" : "프레임 꾸미기 저장"),
        previewKey,
      });

      if (remoteFrameId) {
        await updateFrame(remoteFrameId, body);
      } else {
        await createFrame(body);
        addDraft(themeJson, { name: title.trim() || "새 테마 프레임" });
      }

      router.push("/theme");
    } catch (error) {
      console.error(error);
      alert(getUserFacingApiErrorMessage(error, "저장에 실패했습니다."));
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async () => {
    if (!remoteFrameId || isDeleting) return;

    const ok = confirm("이 프레임을 삭제할까요?");
    if (!ok) return;

    setIsDeleting(true);
    try {
      await deleteFrame(remoteFrameId);
      router.push("/theme");
    } catch (error) {
      console.error(error);
      alert("삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)] px-4 py-6 text-[color:var(--hc-text)]">
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-4 lg:gap-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              하루컷
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              {remoteFrameId ? "저장한 프레임 수정" : "프레임 꾸미기"}
            </h1>
            {loadError ? (
              <p className="mt-1 text-[11px] text-red-300">{loadError}</p>
            ) : null}
            {remoteFrameId && hasNonColorBackground ? (
              <p className="mt-1 text-[11px] text-amber-300">
                이미지/비디오 배경은 미리보기에서 단색 배경으로 보이지만, 배경
                색상을 바꾸지 않으면 기존 배경 정보는 그대로 보존됩니다.
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {remoteFrameId ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting || isSaving}
                className="rounded-full border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-50"
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </button>
            ) : null}
            <Link
              href="/theme"
              className="text-xs text-zinc-400 underline underline-offset-4"
              onClick={() => {
                useThemeEditorStore.getState().reset();
                router.push("/theme");
              }}
            >
              프레임 목록으로 돌아가기
            </Link>
            <button
              type="button"
              onClick={onDone}
              disabled={isSaving || isLoadingFrame || hasRemoteLoadFailure}
              className="rounded-full bg-[color:var(--hc-primary)] px-4 py-2 text-xs font-semibold text-white shadow-[0_16px_36px_rgba(37,99,235,0.24)] hover:bg-[color:var(--hc-primary-strong)] disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : remoteFrameId ? "수정 저장" : "저장"}
            </button>
          </div>
        </header>

        <section className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-semibold text-zinc-100">프레임 정보</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              저장 시 백엔드에 함께 전달될 제목과 설명이에요.
            </p>
          </div>
          <div className="grid gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
               className="h-10 rounded-xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 text-sm text-[color:var(--hc-text)] outline-none focus:border-[color:var(--hc-primary)]"
              placeholder="프레임 이름을 입력해 주세요"
              maxLength={40}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
               className="min-h-24 rounded-xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 py-2 text-sm text-[color:var(--hc-text)] outline-none focus:border-[color:var(--hc-primary)]"
              placeholder="프레임 설명을 입력해 주세요"
              maxLength={160}
            />
          </div>
        </section>

        {isLoadingFrame ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
            저장한 프레임을 불러오는 중입니다.
          </section>
        ) : null}

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
                          ? "border-[color:var(--hc-primary)] bg-[rgba(37,99,235,0.1)] text-[color:var(--hc-primary)]"
                          : "border-[color:var(--hc-border)] text-[color:var(--hc-muted)]"
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
                  className="h-9 w-12 rounded-lg border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)]"
                />
                <input
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-9 flex-1 rounded-lg border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 text-xs text-[color:var(--hc-text)]"
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
                  스티커, 사진, 글을 조합해 나만의 프레임을 만들어요.
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

