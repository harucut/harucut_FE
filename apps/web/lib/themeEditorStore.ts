"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { STICKERS } from "@/constants/stickers.generated";
import { removeImageBackground } from "@/lib/backgroundRemoval";
import { needsUpload } from "@/lib/canvas/componentSource";
import { bakeTextLayerPng } from "@/lib/canvas/textLayer";
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
  // 저장 시: 캔버스에서 실제 쓰는 사진·스티커를 S3에 올리고 글자 층을 굽는다.
  // 컴포넌트 source는 S3 key가 되고, 그릴 주소는 renderUrl로 옮긴다.
  // 안 쓰는 자산은 올리지 않는다. (자세한 이유는 아래 구현부 주석)
  finalizeAssetsForSave: () => Promise<void>;

  addComponentFromAsset: (
    type: "PHOTO" | "STICKER",
    src: string,
  ) => Promise<void>;
  addText: (options?: { text?: string; fontSize?: number }) => void;

  setActive: (id: string | null) => void;
  updateComponent: (id: string, patch: UpdatePatch) => void;

  remove: (id: string) => void;
  // 방금 지운 요소를 되돌린다. 없으면 아무 일도 하지 않는다.
  restoreRemoved: () => void;
  canRestoreRemoved: boolean;
  lastRemoved: EditorComponent | null;
  /** 삭제 당시의 쌓임 순서(배열 인덱스). 되돌릴 때 그 자리에 다시 넣는다. */
  lastRemovedIndex: number | null;
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
    lastRemoved: null,
    lastRemovedIndex: null,
    canRestoreRemoved: false,
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
  lastRemoved: null,
  lastRemovedIndex: null,
  canRestoreRemoved: false,
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
  // 실제 S3 업로드는 저장(onDone) 시 finalizeAssetsForSave에서 사용 중인 자산만 처리한다.
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
      // 누끼는 초 단위로 걸리는데 그 사이 저장 버튼은 잠기지 않는다(processingAssetId 는
      // 그 타일의 누끼 버튼만 막는다). 저장이 먼저 자산을 올리면 위에서 찍어 둔 asset 은
      // 낡는다 — src 도 s3Key 도 바뀐 뒤다. 낡은 값으로 레이어를 찾으면 아래 매칭이
      // 통째로 빗나가 누끼 전 원본이 그대로 남는다. 결과가 도착한 시점의 자산을 다시 본다.
      const latest =
        get().assets.photos.find((photo) => photo.id === assetId) ?? asset;
      const previousSrc = latest.src;
      // 저장을 한 번 시도했다면 이 사진은 이미 올라갔고, 배치된 레이어의 source 는
      // blob 주소가 아니라 S3 key 다(finalizeAssetsForSave). 그 뒤 미리보기 업로드나
      // createFrame/updateFrame 이 실패하면 편집 화면은 그 상태로 남는다.
      // 이때 blob 주소만 견주면 레이어를 못 찾아 누끼 전 원본이 그대로 남고,
      // 다시 저장해도 옛 key 가 서버로 간다. 올린 key 로도 자산-레이어 연결을 잇는다.
      const previousKey = latest.s3Key;

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
        components: current.components.map((component) => {
          if (component.type !== "PHOTO") return component;

          const linked =
            component.source === previousSrc ||
            (Boolean(previousKey) && component.source === previousKey);
          if (!linked) return component;

          // renderUrl 은 올려 둔 누끼 전 원본을 가리킨다. 남겨 두면 캔버스와 미리보기
          // PNG 가 그쪽을 먼저 쓰기 때문에(componentImageSrc) 화면은 그대로다.
          return { ...component, source: objectUrl, renderUrl: undefined };
        }),
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

    // 되돌리기용 스냅샷이 이 사진을 가리키고 있는지 본다. 캔버스에서 사진 레이어를 지운 뒤
    // 사진 탭에서 그 원본까지 지우면, 여기서 blob URL 이 해제된다. 그 상태로 되돌리기를
    // 누르면 이미 죽은 blob: 을 가리키는 레이어가 살아나고, 저장 때 finalizeAssetsForSave
    // 가 원본 파일을 못 찾아 blob: 주소가 그대로 서버로 올라간다 — 깨진 프레임이 된다.
    // 원본이 사라졌으면 되돌릴 수도 없으므로 스냅샷을 함께 버린다.
    const snapshotUsesAsset =
      state.lastRemoved?.type === "PHOTO" &&
      state.lastRemoved.source === asset.src;

    try {
      URL.revokeObjectURL(asset.src);
    } catch {}

    set((s) => ({
      assets: {
        ...s.assets,
        photos: s.assets.photos.filter((p) => p.id !== assetId),
      },
      ...(snapshotUsesAsset
        ? { lastRemoved: null, lastRemovedIndex: null, canRestoreRemoved: false }
        : {}),
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
      // 원본을 전부 버렸으므로 사진 레이어 스냅샷도 되살릴 수 없다(위 removePhotoAsset 참고).
      ...(s.lastRemoved?.type === "PHOTO"
        ? { lastRemoved: null, lastRemovedIndex: null, canRestoreRemoved: false }
        : {}),
    }));
  },

  /**
   * 저장 직전에 **서버가 읽을 수 있는 형태**로 바꾼다.
   *
   * 서버는 컴포넌트의 `source` 를 S3 key 로만 읽는다. 아래 셋 중 하나라도 남아 있으면
   * 그 프레임으로 네컷 합성이 400 GEN-002 로 거부된다(docs/backend-contract.md 실측).
   *   1. 아직 안 올린 로컬 사진(blob URL)
   *   2. 기본 스티커의 정적 경로(`/stickers/sticker-001.png`) — 우리 웹서버 자산이라 서버가 못 본다
   *   3. 글자(TEXT) — 서버는 글자를 그리지 않는다. 구운 PNG 의 key(`renderedKey`)를 같이 보내야 한다
   *
   * 예전 이름은 `finalizePhotosForSave` 였고 1번만 했다. 2·3번이 빠져 있어서
   * **스티커나 글자를 넣은 프레임은 저장은 되는데 촬영 결과가 하나도 안 나왔다.**
   *
   * `source` 에는 key 를, 화면에 그릴 주소는 `renderUrl` 에 둔다(배경이 쓰는 것과 같은 방식).
   * 예전에는 key 를 버리고 서명 URL 을 `source` 에 넣어서, 저장한 프레임이 URL 만료 뒤
   * 빈칸이 되고 서버 합성도 통과하지 못했다.
   */
  finalizeAssetsForSave: async () => {
    // 같은 원본을 두 번 올리지 않도록 경로별로 한 번만 올린다.
    const uploaded = new Map<string, { key: string; url: string }>();

    const uploadOnce = async (src: string, file: File) => {
      const cached = uploaded.get(src);
      if (cached) return cached;

      const { key, objectUrl } = await uploadToS3WithPresigned({
        file,
        type: PRESIGNED_UPLOAD_TYPES.FRAME_COMPONENT,
      });
      const entry = { key, url: objectUrl || src };
      uploaded.set(src, entry);
      return entry;
    };

    // 1) 캔버스에 실제로 올라간 로컬 사진 (편집 중에는 임시 업로드를 하지 않는다)
    const { components, assets } = get();
    const usedPhotoSrcs = new Set(
      components.filter((c) => c.type === "PHOTO").map((c) => c.source),
    );
    for (const asset of assets.photos) {
      if (!asset.file || !usedPhotoSrcs.has(asset.src)) continue;
      if (!needsUpload(asset.src)) continue;
      await uploadOnce(asset.src, asset.file);
    }

    // 2) 기본 스티커 — 정적 경로를 받아다 그대로 올린다.
    //    (서버가 기본 세트를 한 번만 올려 두면 이 왕복은 사라진다. 실측상 자산은 공용이어도
    //     합성이 통과한다 — 본인 소유여야 하는 것은 촬영 원본 4장뿐이다.)
    const stickerSrcs = Array.from(
      new Set(
        get()
          .components.filter((c) => c.type === "STICKER" && needsUpload(c.source))
          .map((c) => c.source),
      ),
    );
    for (const src of stickerSrcs) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`스티커를 불러오지 못했어요 (${src})`);
      const blob = await res.blob();
      const name = src.split("/").pop() || "sticker.png";
      await uploadOnce(
        src,
        new File([blob], name, { type: blob.type || "image/png" }),
      );
    }

    // 3) 글자 — 편집 화면에서 본 픽셀 그대로 구워 올린다.
    //    응답에는 renderedKey 가 안 실려서(합성 전용) 다시 저장할 때도 매번 새로 굽는다.
    //    스타일이나 내용을 고쳤는데 옛 key 를 재사용하면 결과물만 조용히 어긋난다.
    const textKeys = new Map<string, string>();
    for (const component of get().components) {
      if (component.type !== "TEXT") continue;
      if (!component.source.trim()) continue;

      const blob = await bakeTextLayerPng({
        source: component.source,
        width: component.width,
        height: component.height,
        styleJson: component.styleJson as Record<string, unknown> | undefined,
      });
      const { key } = await uploadToS3WithPresigned({
        file: new File([blob], `text-${component.id}.png`, { type: "image/png" }),
        type: PRESIGNED_UPLOAD_TYPES.FRAME_COMPONENT,
      });
      textKeys.set(component.id, key);
    }

    if (uploaded.size === 0 && textKeys.size === 0) return;

    set((s) => ({
      components: s.components.map((c) => {
        if (c.type === "TEXT") {
          const renderedKey = textKeys.get(c.id);
          return renderedKey ? { ...c, renderedKey } : c;
        }

        const entry = uploaded.get(c.source);
        return entry ? { ...c, source: entry.key, renderUrl: entry.url } : c;
      }),
      assets: {
        ...s.assets,
        photos: s.assets.photos.map((a) => {
          const entry = uploaded.get(a.src);
          // src 는 화면용이라 그대로 두고, 올린 사실만 s3Key 로 남겨 재업로드를 막는다.
          return entry ? { ...a, s3Key: entry.key } : a;
        }),
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

  // 삭제는 되돌릴 수 있어야 한다. 스티커 하나를 놓기까지 든 시간이 클릭 한 번에 사라지면
  // 사용자는 편집 자체를 조심스러워한다. 직전 삭제 한 건을 들고 있다가 복구한다.
  remove: (id) => {
    set((s) => {
      const index = s.components.findIndex((c) => c.id === id);
      const removed = index === -1 ? null : s.components[index];
      return {
        components: normalizeZ(s.components.filter((c) => c.id !== id)),
        activeId: s.activeId === id ? null : s.activeId,
        lastRemoved: removed,
        lastRemovedIndex: removed ? index : null,
        canRestoreRemoved: Boolean(removed),
      };
    });
  },

  /**
   * 삭제한 자리로 되돌린다.
   *
   * 예전에는 배열 끝에 붙이고 zIndex 를 다시 매겼다. 그래서 중간이나 맨 아래에 있던
   * 요소를 지웠다 되돌리면 항상 맨 위로 올라왔고, 겹쳐 있던 스티커·사진의 합성 결과가
   * 삭제 전과 달라졌다. "되돌리기"가 이전 상태로 돌아가지 않는 셈이었다.
   * 삭제 당시의 자리(배열 인덱스 = 쌓임 순서)를 함께 들고 있다가 그 자리에 끼워 넣는다.
   */
  restoreRemoved: () => {
    const removed = get().lastRemoved;
    if (!removed) return;
    set((s) => {
      const next = [...s.components];
      const at = Math.min(s.lastRemovedIndex ?? next.length, next.length);
      next.splice(at, 0, removed);
      return {
        components: normalizeZ(next),
        activeId: removed.id,
        lastRemoved: null,
        lastRemovedIndex: null,
        canRestoreRemoved: false,
      };
    });
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
          // 렌더 전용 주소와 구운 글자 층 key. 전자는 요청에서 걸러지고,
          // 후자는 TEXT 합성에 반드시 실려야 한다(lib/frameApi.ts).
          ...(c.renderUrl ? { renderUrl: c.renderUrl } : {}),
          ...(c.renderedKey ? { renderedKey: c.renderedKey } : {}),
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
        // 다른 프레임을 열면 직전 삭제 기록은 버린다. 남겨 두면 새 프레임에서도
        // "삭제 되돌리기"가 켜져 있고, 누르면 이전 프레임의 요소가 지금 프레임에
        // 끼어들어 그대로 저장된다.
        lastRemoved: null,
        lastRemovedIndex: null,
        canRestoreRemoved: false,

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
  // 저장 시 finalizeAssetsForSave가 S3에 올릴 수 있게 한다.
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
        // 다른 프레임을 열면 직전 삭제 기록은 버린다. 남겨 두면 새 프레임에서도
        // "삭제 되돌리기"가 켜져 있고, 누르면 이전 프레임의 요소가 지금 프레임에
        // 끼어들어 그대로 저장된다.
        lastRemoved: null,
        lastRemovedIndex: null,
        canRestoreRemoved: false,
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
