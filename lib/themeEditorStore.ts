"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { STICKERS } from "@/constants/stickers.generated";
import {
  PRESIGNED_UPLOAD_TYPES,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";
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
  const hex = cleaned.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toLowerCase();
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
  backgroundColor: string;

  setFrameId: (id: FrameId) => void;
  setTab: (t: ComponentType) => void;
  setBackgroundColor: (color: string) => void;

  addPhotoAssets: (
    files: FileList,
  ) => Promise<{ added: number; failed: number }>;

  removePhotoAsset: (assetId: string) => {
    ok: boolean;
    reason?: "IN_USE" | "NOT_FOUND";
  };
  resetPhotos: () => void;

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

  return {
    tab: "PHOTO" as ComponentType,
    components: [],
    activeId: null,
    assets: {
      photos: [],
      stickers: state.assets.stickers,
    },
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
  backgroundColor: "111827",

  // 프레임 변경 시 에디터 상태 초기화
  setFrameId: (id) =>
    set((s) => {
      // 같은 프레임 다시 선택하면 아무 것도 안 함
      if (s.frameId === id) return s;

      return {
        frameId: id,
        ...resetEditorState(() => s),
        backgroundColor: "111827",
      };
    }),

  setTab: (t) => set({ tab: t }),
  setBackgroundColor: (color) =>
    set({
      backgroundColor: normalizeHexColor(color),
    }),

  // 업로드한 사진을 임시 S3에 저장하고 에셋으로 등록
  addPhotoAssets: async (files) => {
    const uploaded: Asset[] = [];
    let failed = 0;

    for (const file of Array.from(files)) {
      try {
        const { objectUrl, key } = await uploadToS3WithPresigned({
          file,
          type: PRESIGNED_UPLOAD_TYPES.FRAME_COMPONENTS,
          isTemp: true,
        });
        uploaded.push({
          id: uid("asset"),
          src: objectUrl,
          name: file.name,
          s3Key: key,
        });
      } catch {
        failed += 1;
      }
    }

    if (uploaded.length > 0) {
      set((s) => ({
        assets: { ...s.assets, photos: [...uploaded, ...s.assets.photos] },
        tab: "PHOTO",
      }));
    }

    return { added: uploaded.length, failed };
  },

  // 사용 중인 사진은 삭제 불가
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

    const text = options?.text?.trim() ? options.text.trim() : "HaruCut";
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
    const { frameId, components, backgroundColor } = get();
    if (!frameId) return null;

    const normalized = normalizeZ(components);
    const background: ThemeBackground = {
      type: "COLOR",
      value: normalizeHexColor(backgroundColor),
    };

    return {
      frameId,
      background,
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
        backgroundColor:
          data.background?.type === "COLOR"
            ? normalizeHexColor(data.background.value)
            : "111827",
        assets: {
          photos: [],
          stickers: s.assets.stickers,
        },
      };
    });
  },

  renderKey: 0,

  bumpRenderKey: () =>
    set((s) => ({
      renderKey: s.renderKey + 1,
    })),
}));
