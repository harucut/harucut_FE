import { create } from 'zustand';

import type {
  FrameId,
  SavedFrame,
  ThemeAsset,
  ThemeBackground,
  ThemeComponentStyle,
  ThemeComponentType,
  ThemeEditorComponent,
} from '@/constants/harucut-data';
import { uploadLocalFileWithPresigned } from '@/lib/file-storage-api';
import { createRemoteFrame, updateRemoteFrame } from '@/lib/frame-api';
import {
  clamp,
  createId,
  getThemeCanvas,
  normalizeThemeColor,
  normalizeThemeZ,
  registerWorkspaceReset,
  remoteFrameIdFromSavedId,
} from '@/store/store-helpers';
import { useLibraryStore } from '@/store/use-library-store';

type ThemeEditorSessionState = {
  activeComponentId: string | null;
  assets: {
    photos: ThemeAsset[];
  };
  background: ThemeBackground;
  backgroundColor: string;
  backgroundImageUri: string | null;
  // 업로드 시 형식 판정에 쓰는 원본 정보. 없으면 uri 확장자로만 판정한다.
  backgroundImageName: string | null;
  backgroundImageMimeType: string | null;
  // backgroundImageUri가 새로 고른 로컬 파일이라 저장 시 업로드해야 하는지 여부.
  // 저장 프레임을 다시 열어 원격 배경을 미리보기만 할 때는 false(재업로드 금지, 기존 key 유지).
  backgroundImagePending: boolean;
  components: ThemeEditorComponent[];
  description: string;
  frameId: FrameId;
  selectedSavedFrameId: string | null;
  tab: ThemeComponentType;
  title: string;
  // 셀별 누끼(배경 제거) 상태 — 4칸. 에디터/미리보기 전용.
  cellCutouts: boolean[];
};

// 꾸미기 하단 시트 6탭(핸드오프 app-decorate). 소재 타입 탭은 그대로 두고
// 프레임색/누끼/선택 탭을 별도로 둔다.
export type ThemeDecorateTab = 'photo' | 'frame' | 'text' | 'sticker' | 'cut' | 'layer';

type ThemeComponentTransform = {
  deltaX?: number;
  deltaY?: number;
  rotationDelta?: number;
  scaleMultiplier?: number;
};

type ThemeEditorStore = ThemeEditorSessionState & {
  addThemeComponentFromAsset: (type: 'PHOTO' | 'STICKER', source: string) => void;
  addThemePhotoAssets: (assets: ThemeAsset[]) => void;
  addThemeText: (text?: string) => void;
  duplicateThemeComponent: (id: string) => void;
  hardReset: () => void;
  moveThemeComponentDown: (id: string) => void;
  moveThemeComponentUp: (id: string) => void;
  removeSavedFrame: (id: string) => Promise<void>;
  removeThemeComponent: (id: string) => void;
  removeThemePhotoAsset: (id: string) => { ok: boolean; reason?: 'IN_USE' | 'NOT_FOUND' };
  saveThemeFrame: (previewUri?: string | null) => Promise<string | null>;
  selectSavedFrameForTheme: (frame: SavedFrame) => void;
  clearThemeBackgroundImage: () => void;
  setThemeActiveComponent: (id: string | null) => void;
  setThemeBackgroundColor: (value: string) => void;
  setThemeBackgroundImage: (
    uri: string,
    source?: { filename?: string | null; mimeType?: string | null },
  ) => void;
  setThemeBackgroundPreview: (uri: string) => void;
  setThemeDescription: (value: string) => void;
  setThemeFrame: (frameId: FrameId) => void;
  setThemeTab: (value: ThemeComponentType) => void;
  setThemeTitle: (value: string) => void;
  toggleThemeComponentHidden: (id: string) => void;
  toggleThemeComponentLocked: (id: string) => void;
  toggleThemeCellCutout: (index: number) => void;
  transformThemeComponent: (id: string, transform: ThemeComponentTransform) => void;
  updateThemeComponent: (
    id: string,
    patch: Partial<ThemeEditorComponent> & { styleJson?: ThemeComponentStyle },
  ) => void;
};

function defaultThemeEditor(): ThemeEditorSessionState {
  const backgroundColor = '#EEF5FF';

  return {
    activeComponentId: null,
    assets: {
      photos: [],
    },
    background: {
      type: 'COLOR',
      value: backgroundColor.replace(/^#/, ''),
    },
    backgroundColor,
    backgroundImageUri: null,
    backgroundImageName: null,
    backgroundImageMimeType: null,
    backgroundImagePending: false,
    components: [],
    description: '하루컷에서 직접 꾸민 나만의 프레임',
    frameId: 'polaroid-4',
    selectedSavedFrameId: null,
    tab: 'PHOTO',
    title: '새 테마 프레임',
    cellCutouts: [false, false, false, false],
  };
}

export const useThemeEditorStore = create<ThemeEditorStore>((set, get) => ({
  ...defaultThemeEditor(),
  addThemeComponentFromAsset: (type, source) =>
    set((state) => {
      const canvas = getThemeCanvas(state.frameId);
      const width = type === 'PHOTO' ? canvas.width * 0.38 : canvas.width * 0.18;
      const height = type === 'PHOTO' ? canvas.height * 0.12 : canvas.width * 0.18;
      const id = createId(type === 'PHOTO' ? 'photo' : 'sticker');
      const component: ThemeEditorComponent = {
        height,
        hidden: false,
        id,
        locked: false,
        rotation: 0,
        scale: 1,
        source,
        styleJson: { opacity: 1 },
        type,
        width,
        x: (canvas.width - width) / 2,
        y: (canvas.height - height) / 2,
        zIndex: 0,
      };

      return {
        activeComponentId: id,
        components: normalizeThemeZ([...state.components, component]),
      };
    }),
  addThemePhotoAssets: (assets) =>
    set((state) => ({
      assets: {
        ...state.assets,
        photos: [...assets, ...state.assets.photos],
      },
      tab: 'PHOTO',
    })),
  addThemeText: (text) =>
    set((state) => {
      const canvas = getThemeCanvas(state.frameId);
      const value = text?.trim() || '하루컷';
      const id = createId('text');
      const width = canvas.width * 0.72;
      const height = canvas.height * 0.08;
      const component: ThemeEditorComponent = {
        height,
        hidden: false,
        id,
        locked: false,
        rotation: 0,
        scale: 1,
        source: value,
        styleJson: {
          color: '#ffffff',
          fontFamily: 'Pretendard',
          fontSize: Math.round(canvas.width * 0.08),
          opacity: 1,
          textAlign: 'center',
        },
        type: 'TEXT',
        width,
        x: (canvas.width - width) / 2,
        y: canvas.height * 0.08,
        zIndex: 0,
      };

      return {
        activeComponentId: id,
        components: normalizeThemeZ([...state.components, component]),
        tab: 'TEXT',
      };
    }),
  duplicateThemeComponent: (id) =>
    set((state) => {
      const source = state.components.find((component) => component.id === id);
      if (!source) return state;

      const copy: ThemeEditorComponent = {
        ...source,
        hidden: false,
        id: createId('component'),
        locked: false,
        x: source.x + 40,
        y: source.y + 40,
        zIndex: 0,
      };

      return {
        activeComponentId: copy.id,
        components: normalizeThemeZ([...state.components, copy]),
      };
    }),
  hardReset: () => set(defaultThemeEditor()),
  moveThemeComponentDown: (id) =>
    set((state) => {
      const index = state.components.findIndex((component) => component.id === id);
      if (index <= 0) return state;

      const components = [...state.components];
      [components[index - 1], components[index]] = [components[index], components[index - 1]];

      return {
        components: normalizeThemeZ(components),
      };
    }),
  moveThemeComponentUp: (id) =>
    set((state) => {
      const index = state.components.findIndex((component) => component.id === id);
      if (index < 0 || index >= state.components.length - 1) return state;

      const components = [...state.components];
      [components[index], components[index + 1]] = [components[index + 1], components[index]];

      return {
        components: normalizeThemeZ(components),
      };
    }),
  removeSavedFrame: async (id) => {
    await useLibraryStore.getState().removeSavedFrame(id);

    if (get().selectedSavedFrameId === id) {
      set((state) => ({
        ...defaultThemeEditor(),
        frameId: state.frameId,
      }));
    }
  },
  removeThemeComponent: (id) =>
    set((state) => ({
      activeComponentId: state.activeComponentId === id ? null : state.activeComponentId,
      components: normalizeThemeZ(state.components.filter((component) => component.id !== id)),
    })),
  removeThemePhotoAsset: (id) => {
    const state = get();
    const asset = state.assets.photos.find((photo) => photo.id === id);
    if (!asset) return { ok: false, reason: 'NOT_FOUND' as const };

    const inUse = state.components.some(
      (component) => component.type === 'PHOTO' && component.source === asset.uri,
    );
    if (inUse) return { ok: false, reason: 'IN_USE' as const };

    set((current) => ({
      assets: {
        ...current.assets,
        photos: current.assets.photos.filter((photo) => photo.id !== id),
      },
    }));

    return { ok: true };
  },
  saveThemeFrame: async (previewUri) => {
    const current = get();
    const library = useLibraryStore.getState();
    const title = current.title.trim() || '새 테마 프레임';

    if (!previewUri) {
      throw new Error('프레임 미리보기를 만들지 못했어요.');
    }

    const uploaded = await uploadLocalFileWithPresigned({
      contentType: 'JPEG',
      filename: `${title}.jpg`,
      type: 'FRAME',
      uri: previewUri,
    });

    const selectedFrame = current.selectedSavedFrameId
      ? library.savedFrames.find((frame) => frame.id === current.selectedSavedFrameId)
      : null;
    const remoteFrameId =
      selectedFrame?.remoteFrameId ??
      (current.selectedSavedFrameId ? remoteFrameIdFromSavedId(current.selectedSavedFrameId) : null);
    // 새로 고른 로컬 배경 이미지만 업로드해 IMAGE 배경 key를 채운다.
    // (저장 프레임을 다시 열어 미리보기만 한 경우는 pending=false라 기존 key를 그대로 보존)
    let background = current.background;
    if (current.backgroundImagePending && current.backgroundImageUri) {
      // 형식을 JPEG으로 못 박으면 HEIC/PNG 원본이 image/jpeg 라벨로 S3에 고정돼
      // 웹에서 배경이 통째로 안 보인다. 원본 정보로 판정해 형식·확장자를 맞춘다.
      const uploadedBackground = await uploadLocalFileWithPresigned({
        filename: current.backgroundImageName ?? `${title}-bg`,
        mimeType: current.backgroundImageMimeType,
        type: 'FRAME_COMPONENT',
        uri: current.backgroundImageUri,
      });
      // key만 갈아끼운다. 객체를 새로 만들면 기존 IMAGE 배경의 opacity가 버려진다.
      background = {
        ...(background.type === 'IMAGE' ? background : {}),
        key: uploadedBackground.key,
        type: 'IMAGE',
      };
    }

    const draft = {
      background,
      backgroundColor: current.backgroundColor,
      components: normalizeThemeZ(current.components)
        .filter((component) => !component.hidden)
        .map(({ hidden, locked, ...component }) => component),
      description: current.description,
      frameId: current.frameId,
      previewKey: uploaded.key,
      title,
    };

    if (remoteFrameId) {
      await updateRemoteFrame(remoteFrameId, draft);
    } else {
      await createRemoteFrame(draft);
    }

    await useLibraryStore.getState().loadRemoteFrames();

    const nextFrame = useLibraryStore.getState().savedFrames.find((frame) => {
      if (remoteFrameId) return frame.remoteFrameId === remoteFrameId;
      return frame.title === title && frame.previewKey === uploaded.key;
    });
    const id = nextFrame?.id ?? current.selectedSavedFrameId ?? null;

    if (id) {
      set({ selectedSavedFrameId: id });
    }

    return id;
  },
  selectSavedFrameForTheme: (frame) =>
    set({
      ...defaultThemeEditor(),
      activeComponentId: null,
      assets: {
        photos: [],
      },
      background: frame.background ?? {
        type: 'COLOR',
        value: normalizeThemeColor(frame.backgroundColor).replace(/^#/, ''),
      },
      backgroundColor: frame.backgroundColor,
      backgroundImageUri: null,
      backgroundImageName: null,
      backgroundImageMimeType: null,
      backgroundImagePending: false,
      components: normalizeThemeZ(
        (frame.components ?? []).map((component) => ({
          ...component,
          hidden: false,
          locked: false,
        })),
      ),
      description: frame.description,
      frameId: frame.frameId,
      selectedSavedFrameId: frame.id,
      tab: 'PHOTO',
      title: frame.title,
    }),
  setThemeActiveComponent: (id) => set({ activeComponentId: id }),
  clearThemeBackgroundImage: () =>
    set((state) => ({
      background: {
        type: 'COLOR',
        value: normalizeThemeColor(state.backgroundColor).replace(/^#/, ''),
      },
      backgroundImageUri: null,
      backgroundImageName: null,
      backgroundImageMimeType: null,
      backgroundImagePending: false,
    })),
  setThemeBackgroundColor: (value) => {
    const backgroundColor = normalizeThemeColor(value);

    set({
      background: {
        type: 'COLOR',
        value: backgroundColor.replace(/^#/, ''),
      },
      backgroundColor,
      backgroundImageUri: null,
      backgroundImageName: null,
      backgroundImageMimeType: null,
      backgroundImagePending: false,
    });
  },
  setThemeBackgroundImage: (uri, source) =>
    set({
      // 새로 고른 로컬 이미지 — 저장 시 업로드해 key를 채운다(pending=true).
      background: { type: 'IMAGE' },
      backgroundImageMimeType: source?.mimeType ?? null,
      backgroundImageName: source?.filename ?? null,
      backgroundImagePending: true,
      backgroundImageUri: uri,
    }),
  setThemeBackgroundPreview: (uri) =>
    // 저장된 원격 IMAGE 배경을 편집용으로 미리보기만(기존 key 유지, 재업로드 금지).
    set({ backgroundImageUri: uri, backgroundImagePending: false }),
  setThemeDescription: (value) => set({ description: value }),
  setThemeFrame: (frameId) =>
    set({
      ...defaultThemeEditor(),
      frameId,
      selectedSavedFrameId: null,
    }),
  setThemeTab: (value) => set({ tab: value }),
  setThemeTitle: (value) => set({ title: value }),
  toggleThemeComponentHidden: (id) =>
    set((state) => ({
      components: state.components.map((component) =>
        component.id === id ? { ...component, hidden: !component.hidden } : component,
      ),
    })),
  toggleThemeComponentLocked: (id) =>
    set((state) => ({
      components: state.components.map((component) =>
        component.id === id ? { ...component, locked: !component.locked } : component,
      ),
    })),
  toggleThemeCellCutout: (index) =>
    set((state) => {
      if (index < 0 || index > 3) return state;
      const next = [...state.cellCutouts];
      next[index] = !next[index];
      return { cellCutouts: next };
    }),
  transformThemeComponent: (id, transform) =>
    set((state) => ({
      activeComponentId: id,
      components: state.components.map((component) => {
        if (component.id !== id || component.locked) return component;

        return {
          ...component,
          rotation: component.rotation + (transform.rotationDelta ?? 0),
          scale: clamp(component.scale * (transform.scaleMultiplier ?? 1), 0.2, 3),
          x: component.x + (transform.deltaX ?? 0),
          y: component.y + (transform.deltaY ?? 0),
        };
      }),
    })),
  updateThemeComponent: (id, patch) =>
    set((state) => ({
      components: state.components.map((component) => {
        if (component.id !== id) return component;

        return {
          ...component,
          ...patch,
          id: component.id,
          styleJson: patch.styleJson
            ? { ...(component.styleJson ?? {}), ...patch.styleJson }
            : component.styleJson,
          type: component.type,
          zIndex: component.zIndex,
        };
      }),
    })),
}));

registerWorkspaceReset(() => useThemeEditorStore.getState().hardReset());
