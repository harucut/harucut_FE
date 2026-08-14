"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { STICKERS } from "@/constants/stickers.generated";
import { removeImageBackground } from "@/lib/backgroundRemoval";
import {
  PRESIGNED_UPLOAD_TYPES,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";
import { dataUrlToFile, type EditorDraft } from "@/lib/themeEditorDraft";
import type {
  Asset,
  CommonStyleJson,
  ThemeBackground,
  EditorComponent,
  PhotoComponent,
  StickerComponent,
  TextComponent,
  TextStyleJson,
  ThemeExportJson,
  ComponentType,
} from "@/lib/types/themeEditor";

// 에디터 내부에서 쓰는 임시 ID 생성기
const uid = (prefix = "front") => `${prefix}-${crypto.randomUUID()}`;

// zIndex를 1..N으로 정규화해 레이어 순서 일관성 유지
function normalizeZ(components: EditorComponent[]): EditorComponent[] {
  return components.map((c, i) => ({ ...c, zIndex: i + 1 }));
}

// 이미지 로딩 후 실제 크기 확인
async function readImageSize(
  src: string,
): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        w: img.naturalWidth || img.width,
        h: img.naturalHeight || img.height,
      });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

type TextPatch = Partial<Omit<TextComponent, "id" | "type" | "zIndex">> & {
  styleJson?: Partial<TextStyleJson>;
};

type ImagePatch = Partial<
  Omit<PhotoComponent | StickerComponent, "id" | "type" | "zIndex">
> & {
  styleJson?: Partial<CommonStyleJson>;
};

type UpdatePatch = TextPatch | ImagePatch;

function normalizeHexColor(input: string) {
  const cleaned = input.trim().replace(/^#/, "");
  const hex = cleaned
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6)
    .toLowerCase();
  if (hex.length === 3) {
    return hex
      .split("")
      .map((c) => `${c}${c}`)
      .join("");
  }
  return hex.padEnd(6, "0");
}

type State = {
  frameId: FrameId | null;
  tab: ComponentType;

  assets: {
    photos: Asset[];
    stickers: Asset[];
  };

  components: EditorComponent[];
  activeId: string | null;
  background: ThemeBackground;
  backgroundColor: string;
  // 저장 시 업로드할 로컬 배경 이미지 파일(있을 때만).
  pendingBackgroundFile: File | null;
  // 셀별 누끼(배경 제거) 상태 — 4칸. 에디터/미리보기 전용(서버 미전송).
  cellCutouts: boolean[];
  // 누끼 편집 모드: 켜져 있을 때만 캔버스 셀 탭으로 누끼를 토글한다.
  cutMode: boolean;

  setFrameId: (id: FrameId) => void;
  setTab: (t: ComponentType) => void;
  toggleCellCutout: (index: number) => void;
  setCutMode: (on: boolean) => void;
  setBackgroundColor: (color: string) => void;
  setBackgroundImage: (file: File) => void;
  setBackgroundImageKey: (key: string) => void;
  setBackgroundImageUrl: (url: string) => void;
  clearBackgroundImage: () => void;

  // 호출부가 지원 형식만 미리 걸러 넘길 수 있어 File[]도 받는다.
  addPhotoAssets: (
    files: FileList | File[],
  ) => Promise<{ added: number; failed: number }>;
  removePhotoBackground: (assetId: string) => Promise<{
    ok: boolean;
    reason?: "NOT_FOUND" | "PROCESS_FAILED";
  }>;

  removePhotoAsset: (assetId: string) => {
    ok: boolean;
    reason?: "IN_USE" | "NOT_FOUND";
  };
  resetPhotos: () => void;
  // 저장 시: 캔버스에서 실제 사용 중인 로컬 사진만 S3에 업로드하고
  // 컴포넌트 source를 S3 URL로 치환한다. 미사용 업로드 사진은 올리지 않는다.
  finalizePhotosForSave: () => Promise<void>;

  addComponentFromAsset: (
    type: "PHOTO" | "STICKER",
    src: string,
  ) => Promise<void>;
  addText: (options?: { text?: string; fontSize?: number }) => void;

  setActive: (id: string | null) => void;
  updateComponent: (id: string, patch: UpdatePatch) => void;

  remove: (id: string) => void;
  duplicate: (id: string) => void;

  reset: () => void;

  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;

  toggleHidden: (id: string) => void;
  toggleLocked: (id: string) => void;

  // 숨김 레이어 제외하고 서버 전송용 JSON 생성
  exportJson: () => ThemeExportJson | null;
  importJson: (data: ThemeExportJson) => void;
  // localStorage WIP 초안을 에디터 상태로 복원(dataURL 사진은 File로 되살림).
  hydrateDraft: (draft: EditorDraft) => void;

  // Konva 트랜스포머 업데이트 트리거용 키
  renderKey: number;
  bumpRenderKey: () => void;
};

// 프레임 변경/리셋 시 에디터 상태 초기화 (메모리 정리 포함)
function resetEditorState(get: () => State) {
  const state = get();

  // 업로드 이미지 메모리 정리
  for (const p of state.assets.photos) {
    try {
      URL.revokeObjectURL(p.src);
    } catch {}
  }
  if (state.background.type === "IMAGE" && state.background.url) {
    try {
      URL.revokeObjectURL(state.background.url);
    } catch {}
  }

  return {
    tab: "PHOTO" as ComponentType,
    components: [],
    activeId: null,
    cellCutouts: [false, false, false, false],
    assets: {
      photos: [],
      stickers: state.assets.stickers,
    },
    background: {
      type: "COLOR" as const,
      value: "111827",
    },
    pendingBackgroundFile: null,
  };
}

export const useThemeEditorStore = create<State>((set, get) => ({
  frameId: null,
  tab: "PHOTO",

  assets: {
    photos: [],
    stickers: STICKERS,
  },

  components: [],
  activeId: null,
  background: {
    type: "COLOR",
    value: "111827",
  },
  backgroundColor: "111827",
  pendingBackgroundFile: null,
  cellCutouts: [false, false, false, false],
  cutMode: false,

  // 프레임 변경 시 에디터 상태 초기화
  setFrameId: (id) =>
    set((s) => {
      // 같은 프레임 다시 선택하면 아무 것도 안 함
      if (s.frameId === id) return s;

      return {
        frameId: id,
        ...resetEditorState(() => s),
        background: {
          type: "COLOR",
          value: "111827",
        },
        backgroundColor: "111827",
      };
    }),

  setTab: (t) => set({ tab: t }),
  toggleCellCutout: (index) =>
    set((s) => {
      if (index < 0 || index > 3) return s;
      const next = [...s.cellCutouts];
      next[index] = !next[index];
      return { cellCutouts: next };
    }),
  setCutMode: (on) => set({ cutMode: on }),
  setBackgroundColor: (color) =>
    set((s) => {
      // 색을 고르면 배경 이미지는 해제한다.
      if (s.background.type === "IMAGE" && s.background.url) {
        try {
          URL.revokeObjectURL(s.background.url);
        } catch {}
      }
      const normalized = normalizeHexColor(color);
      return {
        background: {
          type: "COLOR",
          value: normalized,
        },
        backgroundColor: normalized,
        pendingBackgroundFile: null,
      };
    }),
  setBackgroundImage: (file) =>
    set((s) => {
      if (s.background.type === "IMAGE" && s.background.url) {
        try {
          URL.revokeObjectURL(s.background.url);
        } catch {}
      }
      const url = URL.createObjectURL(file);
      return {
        background: { type: "IMAGE", url },
        pendingBackgroundFile: file,
      };
    }),
  setBackgroundImageKey: (key) =>
    set((s) => {
      if (s.background.type !== "IMAGE") return s;
      return { background: { ...s.background, key } };
    }),
  // 저장된 원격 IMAGE 배경(key만 있음)을 편집/썸네일에 렌더하도록 해석된 url을 주입.
  // 재업로드 대상이 아니므로 pendingBackgroundFile은 건드리지 않는다(기존 key 보존).
  setBackgroundImageUrl: (url) =>
    set((s) => {
      if (s.background.type !== "IMAGE") return s;
      return { background: { ...s.background, url } };
    }),
  clearBackgroundImage: () =>
    set((s) => {
      if (s.background.type === "IMAGE" && s.background.url) {
        try {
          URL.revokeObjectURL(s.background.url);
        } catch {}
      }
      return {
        background: { type: "COLOR", value: normalizeHexColor(s.backgroundColor) },
        pendingBackgroundFile: null,
      };
    }),

  // 업로드한 사진은 S3에 올리지 않고 로컬(blob)로만 보관한다.
  // 실제 S3 업로드는 저장(onDone) 시 finalizePhotosForSave에서 사용 중인 사진만 처리한다.
  addPhotoAssets: async (files) => {
    const added: Asset[] = [];
    let failed = 0;

    for (const file of Array.from(files)) {
      try {
        const src = URL.createObjectURL(file);
        added.push({
          id: uid("asset"),
          src,
          name: file.name,
          file,
        });
      } catch {
        failed += 1;
      }
    }

    if (added.length > 0) {
      set((s) => ({
        assets: { ...s.assets, photos: [...added, ...s.assets.photos] },
        tab: "PHOTO",
      }));
    }

    return { added: added.length, failed };
  },

  // 사용 중인 사진은 삭제 불가
  removePhotoBackground: async (assetId) => {
    const state = get();
    const asset = state.assets.photos.find((photo) => photo.id === assetId);
    if (!asset?.file) {
      return { ok: false as const, reason: "NOT_FOUND" as const };
    }

    try {
      const processedFile = await removeImageBackground(asset.file);
      const objectUrl = URL.createObjectURL(processedFile);
      const previousSrc = asset.src;

      set((current) => ({
        assets: {
          ...current.assets,
          photos: current.assets.photos.map((photo) =>
            photo.id === assetId
              ? {
                  ...photo,
                  src: objectUrl,
                  name: processedFile.name,
                  s3Key: undefined,
                  file: processedFile,
                }
              : photo,
          ),
        },
        components: current.components.map((component) =>
          component.type === "PHOTO" && component.source === previousSrc
            ? { ...component, source: objectUrl }
            : component,
        ),
      }));

      try {
        URL.revokeObjectURL(previousSrc);
      } catch {}

      return { ok: true as const };
    } catch (error) {
      console.error(error);
      return { ok: false as const, reason: "PROCESS_FAILED" as const };
    }
  },

  removePhotoAsset: (assetId) => {
    const state = get();
    const asset = state.assets.photos.find((p) => p.id === assetId);
    if (!asset) return { ok: false as const, reason: "NOT_FOUND" as const };

    const inUse = state.components.some(
      (c) => c.type === "PHOTO" && c.source === asset.src,
    );
    if (inUse) return { ok: false as const, reason: "IN_USE" as const };

    try {
      URL.revokeObjectURL(asset.src);
    } catch {}

    set((s) => ({
      assets: {
        ...s.assets,
        photos: s.assets.photos.filter((p) => p.id !== assetId),
      },
    }));

    return { ok: true as const };
  },

  resetPhotos: () => {
    const state = get();
    for (const p of state.assets.photos) {
      try {
        URL.revokeObjectURL(p.src);
      } catch {}
    }
    set((s) => ({
      assets: { ...s.assets, photos: [] },
    }));
  },

  // 저장 시: 실제 캔버스에 올라간 로컬 사진만 S3에 업로드하고
  // 컴포넌트 source/에셋 src를 S3 URL로 치환한다. 한 번 올린(또는 원격) 사진은 건너뛴다.
  // (업로드 계약에 임시/영구 구분은 없다. 편집 중 임시 업로드를 하지 않는 것으로 대신한다.)
  finalizePhotosForSave: async () => {
    const { components, assets } = get();
    const usedSrcs = new Set(
      components
        .filter((c) => c.type === "PHOTO")
        .map((c) => c.source),
    );
    const pending = assets.photos.filter(
      (a) => a.file && !a.s3Key && usedSrcs.has(a.src),
    );
    if (pending.length === 0) return;

    const srcToRemote = new Map<string, string>();
    for (const asset of pending) {
      if (!asset.file) continue;
      const { objectUrl } = await uploadToS3WithPresigned({
        file: asset.file,
        type: PRESIGNED_UPLOAD_TYPES.FRAME_COMPONENT,
      });
      srcToRemote.set(asset.src, objectUrl);
    }

    set((s) => ({
      components: s.components.map((c) =>
        c.type === "PHOTO" && srcToRemote.has(c.source)
          ? { ...c, source: srcToRemote.get(c.source) as string }
          : c,
      ),
      assets: {
        ...s.assets,
        photos: s.assets.photos.map((a) =>
          srcToRemote.has(a.src)
            ? { ...a, src: srcToRemote.get(a.src) as string, s3Key: undefined }
            : a,
        ),
      },
    }));
  },

  // 에셋(사진/스티커)을 캔버스 중앙에 추가
  addComponentFromAsset: async (type, src) => {
    const { frameId } = get();
    if (!frameId) return;

    const layout = FRAME_LAYOUTS[frameId];
    const baseX = layout.totalWidth / 2;
    const baseY = layout.totalHeight / 2;

    const id = uid(type === "PHOTO" ? "photo" : "sticker");

    const draft: EditorComponent =
      type === "PHOTO"
        ? {
            id,
            type: "PHOTO",
            source: src,
            x: baseX,
            y: baseY,
            width: 700,
            height: 500,
            scale: 1,
            rotation: 0,
            zIndex: 0,
            styleJson: { opacity: 1 },
            locked: false,
            hidden: false,
          }
        : {
            id,
            type: "STICKER",
            source: src,
            x: baseX,
            y: baseY,
            width: 600,
            height: 600,
            scale: 1,
            rotation: 0,
            zIndex: 0,
            styleJson: { opacity: 1 },
            locked: false,
            hidden: false,
          };

    set((s) => ({
      components: normalizeZ([...s.components, draft]),
      activeId: id,
    }));

    const size = await readImageSize(src);
    if (!size) return;

    const maxW = 900;
    const maxH = 900;
    const ratio = size.w / size.h;

    let w = Math.min(maxW, size.w);
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }

    get().updateComponent(id, { width: w, height: h });
  },

  // 기본 텍스트 컴포넌트 추가
  addText: (options) => {
    const { frameId } = get();
    if (!frameId) return;

    const text = options?.text?.trim() ? options.text.trim() : "하루컷";
    const rawFontSize =
      typeof options?.fontSize === "number" && Number.isFinite(options.fontSize)
        ? options.fontSize
        : 256;
    const fontSize = Math.min(420, Math.max(12, rawFontSize));

    const layout = FRAME_LAYOUTS[frameId];
    const id = uid("text");

    const style: TextStyleJson = {
      fontFamily: "Pretendard",
      fontSize,
      color: "#ffffff",
      textAlign: "center",
      opacity: 1,
    };

    const c: TextComponent = {
      id,
      type: "TEXT",
      source: text,
      x: layout.totalWidth / 2,
      y: 300,
      width: 1200,
      height: 140,
      scale: 1,
      rotation: 0,
      zIndex: 0,
      styleJson: style,
      locked: false,
      hidden: false,
    };

    set((s) => ({
      components: normalizeZ([...s.components, c]),
      activeId: id,
      tab: "TEXT",
    }));
  },

  setActive: (id) => set({ activeId: id }),

  // 컴포넌트 속성 업데이트 (TEXT와 IMAGE 분기)
  updateComponent: (id, patch) => {
    set((s) => ({
      components: s.components.map((c) => {
        if (c.id !== id) return c;

        if (c.type === "TEXT") {
          const p = patch as TextPatch;
          const nextStyle = p.styleJson
            ? { ...c.styleJson, ...p.styleJson }
            : c.styleJson;

          return { ...c, ...p, zIndex: c.zIndex, styleJson: nextStyle };
        }

        // PHOTO / STICKER
        const p = patch as ImagePatch;
        const current = (c.styleJson ?? {}) as CommonStyleJson;
        const nextStyle = p.styleJson
          ? { ...current, ...p.styleJson }
          : current;

        return { ...c, ...p, zIndex: c.zIndex, styleJson: nextStyle };
      }),
    }));
  },

  remove: (id) => {
    set((s) => ({
      components: normalizeZ(s.components.filter((c) => c.id !== id)),
      activeId: s.activeId === id ? null : s.activeId,
    }));
  },

  duplicate: (id) => {
    const src = get().components.find((c) => c.id === id);
    if (!src) return;

    const copy: EditorComponent = {
      ...src,
      id: uid("dup"),
      x: src.x + 40,
      y: src.y + 40,
      zIndex: 0,
    };

    set((s) => ({
      components: normalizeZ([...s.components, copy]),
      activeId: copy.id,
    }));
  },

  reset: () => {
    set((s) => ({
      frameId: null,
      ...resetEditorState(() => s),
    }));
  },

  moveLayerUp: (id) => {
    set((s) => {
      const idx = s.components.findIndex((c) => c.id === id);
      if (idx < 0 || idx === s.components.length - 1) return s;

      const next = [...s.components];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return { components: normalizeZ(next) };
    });
  },

  moveLayerDown: (id) => {
    set((s) => {
      const idx = s.components.findIndex((c) => c.id === id);
      if (idx <= 0) return s;

      const next = [...s.components];
      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      return { components: normalizeZ(next) };
    });
  },

  toggleHidden: (id) => {
    set((s) => ({
      components: s.components.map((c) =>
        c.id === id ? { ...c, hidden: !c.hidden } : c,
      ),
    }));
  },

  toggleLocked: (id) => {
    set((s) => ({
      components: s.components.map((c) =>
        c.id === id ? { ...c, locked: !c.locked } : c,
      ),
    }));
  },

  exportJson: () => {
    const { frameId, components, backgroundColor, background, cellCutouts } =
      get();
    if (!frameId) return null;

    const normalized = normalizeZ(components);
    const exportedBackground: ThemeBackground =
      background.type === "COLOR"
        ? {
            type: "COLOR",
            value: normalizeHexColor(backgroundColor),
          }
        : background;

    return {
      frameId,
      background: exportedBackground,
      cellCutouts: [...cellCutouts],
      components: normalized
        .filter((c) => !c.hidden)
        .map((c) => ({
          id: c.id,
          type: c.type,
          source: c.source,
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
          scale: c.scale ?? 1,
          rotation: c.rotation ?? 0,
          zIndex: c.zIndex,
          styleJson: (c.styleJson ?? {}) as Record<string, unknown>,
        })),
    };
  },

  // 저장된 JSON을 에디터 상태로 복원
  importJson: (data) => {
    set((s) => {
      const mapped: EditorComponent[] = data.components.map((c) => ({
        ...c,
        scale: c.scale ?? 1,
        rotation: c.rotation ?? 0,
        locked: false,
        hidden: false,
      })) as EditorComponent[];

      return {
        frameId: data.frameId,
        tab: "PHOTO",
        components: normalizeZ(mapped),
        activeId: null,
        cellCutouts: Array.isArray(data.cellCutouts)
          ? [0, 1, 2, 3].map((i) => Boolean(data.cellCutouts?.[i]))
          : [false, false, false, false],
        background: data.background ?? {
          type: "COLOR",
          value: "111827",
        },
        backgroundColor:
          data.background?.type === "COLOR"
            ? normalizeHexColor(data.background.value)
            : "111827",
        pendingBackgroundFile: null,
        assets: {
          photos: [],
          stickers: s.assets.stickers,
        },
      };
    });
  },

  // localStorage WIP 초안을 에디터 상태로 복원한다. dataURL 사진은 File로 되살려
  // 저장 시 finalizePhotosForSave가 S3에 올릴 수 있게 한다.
  hydrateDraft: (draft) => {
    set((s) => {
      const photoSrcs = Array.from(
        new Set(
          draft.components
            .filter((c) => c.type === "PHOTO")
            .map((c) => c.source)
            .filter((src) => src.startsWith("data:")),
        ),
      );
      const photos: Asset[] = photoSrcs.map((src) => ({
        id: uid("asset"),
        src,
        name: "draft.png",
        file: dataUrlToFile(src, `draft-${crypto.randomUUID()}.png`),
      }));

      let pendingBackgroundFile: File | null = null;
      if (
        draft.background.type === "IMAGE" &&
        draft.background.url?.startsWith("data:")
      ) {
        pendingBackgroundFile = dataUrlToFile(
          draft.background.url,
          `bg-${crypto.randomUUID()}.png`,
        );
      }

      return {
        frameId: draft.frameId,
        tab: "PHOTO" as ComponentType,
        components: normalizeZ(
          draft.components.map((c) => ({
            ...c,
            locked: false,
            hidden: false,
          })) as EditorComponent[],
        ),
        activeId: null,
        background: draft.background,
        backgroundColor:
          draft.background.type === "COLOR"
            ? normalizeHexColor(draft.background.value)
            : normalizeHexColor(draft.backgroundColor),
        pendingBackgroundFile,
        cellCutouts: [0, 1, 2, 3].map((i) => Boolean(draft.cellCutouts?.[i])),
        assets: { photos, stickers: s.assets.stickers },
      };
    });
  },

  renderKey: 0,

  bumpRenderKey: () =>
    set((s) => ({
      renderKey: s.renderKey + 1,
    })),
}));
