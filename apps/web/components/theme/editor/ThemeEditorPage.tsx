"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { BACKGROUND_COLORS } from "@/constants/colors";
import { CanvasStage } from "@/components/theme/editor/canvas/CanvasStage";
import { AssetPanel } from "@/components/theme/editor/AssetPanel";
import { LayersPanel } from "@/components/theme/editor/LayersPanel";
import { InspectorPanel } from "@/components/theme/editor/InspectorPanel";
import { CutoutPanel } from "@/components/theme/editor/CutoutPanel";
import { BrandMark } from "@/components/layout/BrandMark";
import { toCreateFrameRequest, toThemeExportJson } from "@/lib/frameApi";
import {
  createFrame,
  deleteFrame,
  getFrame,
  updateFrame,
} from "@/lib/remoteFrameApi";
import {
  PRESIGNED_UPLOAD_TYPES,
  getImageUrlByKey,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";
import { renderThemePreviewPng } from "@/lib/canvas/renderThemePreview";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import { useThemeSession } from "@/lib/themeSessionStore";
import { useThemeDraftStore } from "@/lib/themeDraftStore";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import {
  clearEditorDraft,
  loadEditorDraft,
  saveEditorDraft,
} from "@/lib/themeEditorDraft";

export function ThemeEditorPage({ frameId }: { frameId: FrameId }) {
  const router = useRouter();
  const setFrameId = useThemeEditorStore((s) => s.setFrameId);
  const exportJson = useThemeEditorStore((s) => s.exportJson);
  const importJson = useThemeEditorStore((s) => s.importJson);
  const resetPhotos = useThemeEditorStore((s) => s.resetPhotos);
  const hydrateDraft = useThemeEditorStore((s) => s.hydrateDraft);
  const background = useThemeEditorStore((s) => s.background);
  const backgroundColor = useThemeEditorStore((s) => s.backgroundColor);
  const setBackgroundColor = useThemeEditorStore((s) => s.setBackgroundColor);
  const setBackgroundImage = useThemeEditorStore((s) => s.setBackgroundImage);
  const setBackgroundImageUrl = useThemeEditorStore((s) => s.setBackgroundImageUrl);
  const clearBackgroundImage = useThemeEditorStore((s) => s.clearBackgroundImage);
  const addDraft = useThemeDraftStore((s) => s.addDraft);
  const editorComponents = useThemeEditorStore((s) => s.components);
  const { remoteFrameId } = useThemeSession();

  // 스티커/텍스트를 하나라도 얹었거나 배경을 이미지로 바꿨으면 편집 중으로 보고,
  // 새로고침/이탈 시 유실 경고를 띄운다(저장 프레임 편집은 자동 초안 대상이 아니므로 특히 중요).
  useUnsavedWorkGuard(editorComponents.length > 0 || background.type !== "COLOR");

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFrame, setIsLoadingFrame] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saveDialogError, setSaveDialogError] = useState<string | null>(null);
  const hasRemoteLoadFailure = Boolean(remoteFrameId && loadError);

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
        if (cancelled) return;
        const imported = toThemeExportJson(remoteFrame);
        importJson(imported);
        setTitle(remoteFrame.title || "");
        setDescription(remoteFrame.description || "");

        // IMAGE 배경(key만 있음)은 url을 해석해 캔버스/썸네일에 렌더되도록 주입.
        // 그래야 수정 저장 시 배경이 빠진 단색 썸네일로 저장되지 않는다.
        const importedKey =
          imported.background?.type === "IMAGE" ? imported.background.key : undefined;
        if (importedKey) {
          const url = await getImageUrlByKey(importedKey);
          // 해석을 기다리는 동안 사용자가 새 배경(로컬 파일/다른 key)을 골랐을 수 있다.
          // 현재 배경이 여전히 같은 원격 key일 때만 적용해 stale URL 덮어쓰기를 막는다.
          const current = useThemeEditorStore.getState();
          if (
            !cancelled &&
            url &&
            !current.pendingBackgroundFile &&
            current.background.type === "IMAGE" &&
            current.background.key === importedKey
          ) {
            setBackgroundImageUrl(url);
          }
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
  }, [importJson, remoteFrameId, setBackgroundImageUrl]);

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

  // 새 프레임 작업 시: 새로고침/이탈로 남은 WIP 초안(localStorage)이 있으면 복원한다.
  // 원격 프레임 수정 중에는 저장본을 불러오므로 초안 복원을 하지 않는다.
  const didRestoreDraftRef = useRef(false);
  useEffect(() => {
    if (remoteFrameId || didRestoreDraftRef.current) return;
    didRestoreDraftRef.current = true;
    const draft = loadEditorDraft();
    if (draft && draft.frameId === frameId) {
      hydrateDraft(draft);
    }
  }, [frameId, remoteFrameId, hydrateDraft]);

  // 편집 중 상태를 localStorage에 자동 저장(디바운스). S3 temp 업로드 대신 로컬 보관.
  useEffect(() => {
    if (remoteFrameId) return;
    let timer: number | undefined;
    const unsubscribe = useThemeEditorStore.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const s = useThemeEditorStore.getState();
        if (!s.frameId) return;
        const isEmptyDefault =
          s.components.length === 0 && s.background.type === "COLOR";
        if (isEmptyDefault) {
          clearEditorDraft();
          return;
        }
        void saveEditorDraft({
          frameId: s.frameId,
          backgroundColor: s.backgroundColor,
          background: s.background,
          cellCutouts: s.cellCutouts,
          components: s.components,
          now: Date.now(),
        });
      }, 1000);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [remoteFrameId]);

  const openSaveDialog = () => {
    setDraftTitle(title);
    setDraftDescription(description);
    setSaveDialogError(null);
    setIsSaveDialogOpen(true);
  };

  const onDone = async () => {
    if (isSaving || isLoadingFrame) return;
    if (hasRemoteLoadFailure) {
      setSaveDialogError("저장한 프레임을 불러오지 못해 수정 저장을 막았습니다.");
      return;
    }

    const state = useThemeEditorStore.getState();
    const hiddenCount = state.components.filter((c) => c.hidden).length;
    if (hiddenCount > 0) {
      alert("숨겨진 레이어가 있어요.");
    }

    const nextTitle = draftTitle.trim() || "테마 프레임";
    const nextDescription =
      draftDescription.trim() ||
      (remoteFrameId ? "프레임 꾸미기 수정" : "프레임 꾸미기 저장");

    setIsSaving(true);
    setSaveDialogError(null);
    try {
      // 로컬 배경 이미지가 있으면 먼저 업로드해 IMAGE 배경 key를 채운다.
      const editorState = useThemeEditorStore.getState();
      if (
        editorState.pendingBackgroundFile &&
        editorState.background.type === "IMAGE" &&
        !editorState.background.key
      ) {
        const { key } = await uploadToS3WithPresigned({
          file: editorState.pendingBackgroundFile,
          type: PRESIGNED_UPLOAD_TYPES.FRAME,
          isTemp: false,
        });
        useThemeEditorStore.getState().setBackgroundImageKey(key);
      }

      // 캔버스에서 실제 사용 중인 로컬 사진을 이 시점에 최종 업로드한다(편집 중엔 temp 업로드 없음).
      await useThemeEditorStore.getState().finalizePhotosForSave();

      const themeJson = exportJson();
      if (!themeJson) {
        setIsSaving(false);
        return;
      }

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
        title: nextTitle,
        description: nextDescription,
        previewKey,
      });

      if (remoteFrameId) {
        await updateFrame(remoteFrameId, body);
      } else {
        await createFrame(body);
        addDraft(themeJson, { name: nextTitle });
      }

      clearEditorDraft();
      setTitle(nextTitle);
      setDescription(nextDescription);
      setIsSaveDialogOpen(false);
      router.push("/theme");
    } catch (error) {
      console.error(error);
      setSaveDialogError(
        getUserFacingApiErrorMessage(error, "저장에 실패했습니다."),
      );
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
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)]">
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-4 lg:gap-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <BrandMark href="/home" compact className="opacity-80" />
            {loadError ? (
              <p className="mt-1 text-[11px] text-red-300">{loadError}</p>
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
                clearEditorDraft();
                router.push("/theme");
              }}
            >
              프레임 목록으로 돌아가기
            </Link>
            <button
              type="button"
              onClick={openSaveDialog}
              disabled={isSaving || isLoadingFrame || hasRemoteLoadFailure}
              className="hc-button-primary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : remoteFrameId ? "수정 저장" : "저장"}
            </button>
          </div>
        </header>

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
              <p className="text-sm font-semibold">배경</p>
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
                          ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)] text-[color:var(--hc-primary)]"
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
              <div className="flex items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-[color:var(--hc-border)] px-3 text-[11px] font-semibold text-[color:var(--hc-text)] hover:border-[color:var(--hc-primary)]">
                  {background.type === "IMAGE" ? "배경 이미지 변경" : "배경 이미지"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setBackgroundImage(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {background.type === "IMAGE" ? (
                  <button
                    type="button"
                    onClick={clearBackgroundImage}
                    className="h-9 rounded-lg border border-[color:var(--hc-border)] px-3 text-[11px] font-semibold text-[color:var(--hc-muted)] hover:border-[color:var(--hc-primary)]"
                  >
                    이미지 제거
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] leading-4 text-[color:var(--hc-muted)]">
                배경 이미지는 사진 칸 뒤에 깔려요.
              </p>
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
            <CutoutPanel />
          </div>

          <div className="lg:col-start-2 lg:row-start-4">
            <LayersPanel />
          </div>

          <div className="lg:col-start-2 lg:row-start-5">
            <InspectorPanel />
          </div>
        </div>
      </div>

      {isSaveDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-5 sm:items-center">
          <div
            aria-modal="true"
            aria-labelledby="theme-save-dialog-title"
            role="dialog"
            className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
          >
            <div>
              <h2
                className="text-base font-semibold text-zinc-50"
                id="theme-save-dialog-title"
              >
                {remoteFrameId ? "저장한 프레임 수정" : "프레임 저장"}
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                저장할 프레임 이름과 설명을 입력해 주세요.
              </p>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-[11px] font-semibold text-zinc-300">
                프레임 이름
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="h-10 rounded-xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 text-sm font-normal text-[color:var(--hc-text)] outline-none focus:border-[color:var(--hc-primary)]"
                  disabled={isSaving}
                  maxLength={40}
                  placeholder="프레임 이름을 입력해 주세요"
                />
              </label>
              <label className="grid gap-1.5 text-[11px] font-semibold text-zinc-300">
                프레임 설명
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  className="min-h-24 rounded-xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 py-2 text-sm font-normal text-[color:var(--hc-text)] outline-none focus:border-[color:var(--hc-primary)]"
                  disabled={isSaving}
                  maxLength={160}
                  placeholder="프레임 설명을 입력해 주세요"
                />
              </label>
              {saveDialogError ? (
                <p className="text-[11px] leading-5 text-red-300">
                  {saveDialogError}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isSaving) {
                    setIsSaveDialogOpen(false);
                  }
                }}
                disabled={isSaving}
                className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void onDone()}
                disabled={isSaving}
                className="hc-button-primary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
              >
                {isSaving ? "저장 중..." : remoteFrameId ? "수정 저장" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

