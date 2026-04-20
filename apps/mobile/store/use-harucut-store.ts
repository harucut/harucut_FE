import { create } from 'zustand';

import {
  FRAME_BORDER_OPTIONS,
  FRAME_CATALOG,
  INITIAL_HISTORY_ITEMS,
  INITIAL_SAVED_FRAMES,
  INITIAL_USER,
  type FrameId,
  type HistoryItem,
  type MediaAsset,
  type OutputTone,
  type SavedFrame,
  type UserProfile,
} from '@/constants/harucut-data';
import type { ButtonVariant } from '@/constants/harucut-design';

type AccessMode = 'guest' | 'member';

type NoticeActionId =
  | 'dismiss'
  | 'go-login'
  | 'go-shoot'
  | 'go-landing'
  | 'start-guest-trial';

type NoticeAction = {
  id: NoticeActionId;
  label: string;
  variant?: ButtonVariant;
};

type NoticeState = {
  actions: NoticeAction[];
  eyebrow?: string;
  icon?: string;
  message: string;
  title: string;
};

type ShootSession = {
  borderColor: string;
  frameId: FrameId;
  includeVideo: boolean;
  persistedHistoryId: string | null;
  selectedSavedFrameId: string | null;
  selectedShotIds: string[];
  shots: MediaAsset[];
  tone: OutputTone;
};

type UploadSession = {
  assets: MediaAsset[];
  borderColor: string;
  frameId: FrameId;
  includeVideo: boolean;
  persistedHistoryId: string | null;
  selectedAssetIds: string[];
  selectedSavedFrameId: string | null;
  tone: OutputTone;
};

type ThemeEditorState = {
  accentColor: string;
  backgroundColor: string;
  caption: string;
  description: string;
  frameId: FrameId;
  selectedSavedFrameId: string | null;
  stickers: string[];
  title: string;
};

type HarucutStore = {
  accessMode: AccessMode;
  historyItems: HistoryItem[];
  notice: NoticeState | null;
  shoot: ShootSession;
  themeEditor: ThemeEditorState;
  upload: UploadSession;
  user: UserProfile;
  addShootShot: (asset: MediaAsset) => void;
  clearNotice: () => void;
  enterGuestMode: () => void;
  enterMemberMode: () => void;
  addUploadAssets: (assets: MediaAsset[]) => void;
  persistShootResult: () => string | null;
  persistUploadResult: () => string | null;
  removeSavedFrame: (id: string) => void;
  renameHistoryItem: (id: string, title: string) => void;
  resetShootSession: () => void;
  resetThemeEditor: () => void;
  resetUploadSession: () => void;
  savedFrames: SavedFrame[];
  saveThemeFrame: () => string;
  selectSavedFrameForShoot: (frame: SavedFrame) => void;
  selectSavedFrameForTheme: (frame: SavedFrame) => void;
  selectSavedFrameForUpload: (frame: SavedFrame) => void;
  setShootFrame: (frameId: FrameId) => void;
  setShootOption: (key: keyof Pick<ShootSession, 'borderColor' | 'includeVideo' | 'tone'>, value: string | boolean) => void;
  setThemeAccentColor: (value: string) => void;
  setThemeBackgroundColor: (value: string) => void;
  setThemeCaption: (value: string) => void;
  setThemeDescription: (value: string) => void;
  setThemeFrame: (frameId: FrameId) => void;
  setThemeTitle: (value: string) => void;
  setUploadFrame: (frameId: FrameId) => void;
  setUploadOption: (key: keyof Pick<UploadSession, 'borderColor' | 'includeVideo' | 'tone'>, value: string | boolean) => void;
  setUserProfile: (next: Partial<UserProfile>) => void;
  showGuestRestrictedNotice: () => void;
  showGuestShareNotice: () => void;
  showGuestTrialNotice: () => void;
  showNotice: (notice: NoticeState) => void;
  toggleShootSelection: (id: string) => void;
  toggleThemeSticker: (value: string) => void;
  toggleUploadSelection: (id: string) => void;
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueMedia(items: MediaAsset[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function limitSelection(current: string[], id: string) {
  if (current.includes(id)) {
    return current.filter((item) => item !== id);
  }

  if (current.length >= 4) {
    return current;
  }

  return [...current, id];
}

function selectedMedia(items: MediaAsset[], selectedIds: string[]) {
  const selected = items.filter((item) => selectedIds.includes(item.id));
  return selected.slice(0, 4);
}

const defaultBorderColor = FRAME_BORDER_OPTIONS[0].value;

function defaultShootSession(): ShootSession {
  return {
    borderColor: defaultBorderColor,
    frameId: 'classic-4',
    includeVideo: false,
    persistedHistoryId: null,
    selectedSavedFrameId: null,
    selectedShotIds: [],
    shots: [],
    tone: '기본',
  };
}

function defaultUploadSession(): UploadSession {
  return {
    assets: [],
    borderColor: defaultBorderColor,
    frameId: 'classic-4',
    includeVideo: false,
    persistedHistoryId: null,
    selectedAssetIds: [],
    selectedSavedFrameId: null,
    tone: '기본',
  };
}

function defaultThemeEditor(): ThemeEditorState {
  return {
    accentColor: '#2563EB',
    backgroundColor: '#EEF5FF',
    caption: 'today archive',
    description: '하루컷에서 직접 꾸민 나만의 프레임',
    frameId: 'polaroid-4',
    selectedSavedFrameId: null,
    stickers: ['✦', '♡'],
    title: '새 테마 프레임',
  };
}

function frameName(frameId: FrameId) {
  return FRAME_CATALOG.find((item) => item.frameId === frameId)?.name ?? '하루컷 프레임';
}

function upsertHistoryItem(
  items: HistoryItem[],
  nextItem: HistoryItem,
  existingId: string | null
) {
  if (!existingId) {
    return [nextItem, ...items];
  }

  return items.map((item) => (item.id === existingId ? nextItem : item));
}

export const useHarucutStore = create<HarucutStore>((set, get) => ({
  accessMode: 'member',
  historyItems: INITIAL_HISTORY_ITEMS,
  notice: null,
  shoot: defaultShootSession(),
  themeEditor: defaultThemeEditor(),
  upload: defaultUploadSession(),
  user: INITIAL_USER,
  addShootShot: (asset) =>
    set((state) => {
      const shots = [...state.shoot.shots, asset].slice(-8);
      const selectedShotIds =
        state.shoot.selectedShotIds.length < 4
          ? [...state.shoot.selectedShotIds, asset.id].slice(0, 4)
          : state.shoot.selectedShotIds;

      return {
        shoot: {
          ...state.shoot,
          selectedShotIds,
          shots,
        },
      };
    }),
  clearNotice: () => set({ notice: null }),
  enterGuestMode: () =>
    set({
      accessMode: 'guest',
      notice: null,
      shoot: defaultShootSession(),
      themeEditor: defaultThemeEditor(),
      upload: defaultUploadSession(),
    }),
  enterMemberMode: () =>
    set({
      accessMode: 'member',
      notice: null,
    }),
  addUploadAssets: (assets) =>
    set((state) => {
      const nextAssets = uniqueMedia([...state.upload.assets, ...assets]);
      const nextSelectedIds = [...state.upload.selectedAssetIds];

      for (const asset of assets) {
        if (nextSelectedIds.length >= 4) break;
        if (!nextSelectedIds.includes(asset.id)) {
          nextSelectedIds.push(asset.id);
        }
      }

      return {
        upload: {
          ...state.upload,
          assets: nextAssets,
          selectedAssetIds: nextSelectedIds.slice(0, 4),
        },
      };
    }),
  persistShootResult: () => {
    const state = get();
    const previewMedia = selectedMedia(state.shoot.shots, state.shoot.selectedShotIds);

    if (previewMedia.length === 0) {
      return null;
    }

    if (state.accessMode === 'guest') {
      return null;
    }

    const id = state.shoot.persistedHistoryId ?? createId('shoot-result');
    const nextItem: HistoryItem = {
      createdAt: new Date().toISOString(),
      frameId: state.shoot.frameId,
      id,
      kind: state.shoot.includeVideo ? 'video' : 'photo',
      previewMedia,
      source: 'shoot',
      title: `${frameName(state.shoot.frameId)} 촬영 결과`,
    };

    set((current) => ({
      historyItems: upsertHistoryItem(current.historyItems, nextItem, current.shoot.persistedHistoryId),
      shoot: {
        ...current.shoot,
        persistedHistoryId: id,
      },
    }));

    return id;
  },
  persistUploadResult: () => {
    const state = get();
    const previewMedia = selectedMedia(state.upload.assets, state.upload.selectedAssetIds);

    if (previewMedia.length === 0) {
      return null;
    }

    const id = state.upload.persistedHistoryId ?? createId('upload-result');
    const nextItem: HistoryItem = {
      createdAt: new Date().toISOString(),
      frameId: state.upload.frameId,
      id,
      kind: state.upload.includeVideo ? 'video' : 'photo',
      previewMedia,
      source: 'upload',
      title: `${frameName(state.upload.frameId)} 업로드 결과`,
    };

    set((current) => ({
      historyItems: upsertHistoryItem(current.historyItems, nextItem, current.upload.persistedHistoryId),
      upload: {
        ...current.upload,
        persistedHistoryId: id,
      },
    }));

    return id;
  },
  removeSavedFrame: (id) =>
    set((state) => ({
      savedFrames: state.savedFrames.filter((frame) => frame.id !== id),
      themeEditor:
        state.themeEditor.selectedSavedFrameId === id
          ? { ...defaultThemeEditor(), frameId: state.themeEditor.frameId }
          : state.themeEditor,
    })),
  renameHistoryItem: (id, title) =>
    set((state) => ({
      historyItems: state.historyItems.map((item) => (item.id === id ? { ...item, title } : item)),
    })),
  resetShootSession: () =>
    set((state) => ({
      shoot: { ...defaultShootSession(), frameId: state.shoot.frameId },
    })),
  resetThemeEditor: () =>
    set((state) => ({
      themeEditor: { ...defaultThemeEditor(), frameId: state.themeEditor.frameId },
    })),
  resetUploadSession: () =>
    set((state) => ({
      upload: { ...defaultUploadSession(), frameId: state.upload.frameId },
    })),
  savedFrames: INITIAL_SAVED_FRAMES,
  saveThemeFrame: () => {
    const state = get();
    const current = state.themeEditor;
    const id = current.selectedSavedFrameId ?? createId('saved-frame');
    const nextFrame: SavedFrame = {
      accentColor: current.accentColor,
      backgroundColor: current.backgroundColor,
      caption: current.caption,
      description: current.description,
      frameId: current.frameId,
      id,
      stickers: current.stickers,
      title: current.title.trim() || '새 테마 프레임',
      updatedAt: new Date().toISOString(),
    };

    set((store) => {
      const nextFrames = store.savedFrames.some((frame) => frame.id === id)
        ? store.savedFrames.map((frame) => (frame.id === id ? nextFrame : frame))
        : [nextFrame, ...store.savedFrames];

      return {
        savedFrames: nextFrames,
        themeEditor: {
          ...store.themeEditor,
          selectedSavedFrameId: id,
        },
      };
    });

    return id;
  },
  selectSavedFrameForShoot: (frame) =>
    set({
      shoot: {
        ...defaultShootSession(),
        borderColor: frame.accentColor,
        frameId: frame.frameId,
        selectedSavedFrameId: frame.id,
      },
    }),
  selectSavedFrameForTheme: (frame) =>
    set({
      themeEditor: {
        accentColor: frame.accentColor,
        backgroundColor: frame.backgroundColor,
        caption: frame.caption,
        description: frame.description,
        frameId: frame.frameId,
        selectedSavedFrameId: frame.id,
        stickers: frame.stickers,
        title: frame.title,
      },
    }),
  selectSavedFrameForUpload: (frame) =>
    set((state) => ({
      upload: {
        ...state.upload,
        borderColor: frame.accentColor,
        frameId: frame.frameId,
        selectedSavedFrameId: frame.id,
      },
    })),
  setShootFrame: (frameId) =>
    set((state) => ({
      shoot: {
        ...defaultShootSession(),
        frameId,
        selectedSavedFrameId: null,
      },
    })),
  setShootOption: (key, value) =>
    set((state) => ({
      shoot: {
        ...state.shoot,
        [key]: value,
      },
    })),
  setThemeAccentColor: (value) =>
    set((state) => ({ themeEditor: { ...state.themeEditor, accentColor: value } })),
  setThemeBackgroundColor: (value) =>
    set((state) => ({ themeEditor: { ...state.themeEditor, backgroundColor: value } })),
  setThemeCaption: (value) =>
    set((state) => ({ themeEditor: { ...state.themeEditor, caption: value } })),
  setThemeDescription: (value) =>
    set((state) => ({ themeEditor: { ...state.themeEditor, description: value } })),
  setThemeFrame: (frameId) =>
    set((state) => ({
      themeEditor: { ...defaultThemeEditor(), frameId, selectedSavedFrameId: null },
    })),
  setThemeTitle: (value) =>
    set((state) => ({ themeEditor: { ...state.themeEditor, title: value } })),
  setUploadFrame: (frameId) =>
    set((state) => ({
      upload: {
        ...defaultUploadSession(),
        frameId,
        selectedSavedFrameId: null,
      },
    })),
  setUploadOption: (key, value) =>
    set((state) => ({
      upload: {
        ...state.upload,
        [key]: value,
      },
    })),
  setUserProfile: (next) =>
    set((state) => ({
      user: {
        ...state.user,
        ...next,
      },
    })),
  showGuestRestrictedNotice: () =>
    set({
      notice: {
        actions: [
          { id: 'go-login', label: '로그인하기' },
          { id: 'go-shoot', label: '촬영 계속하기', variant: 'secondary' },
        ],
        eyebrow: 'GUEST MODE',
        icon: 'lock-closed-outline',
        message:
          '비회원 체험에서는 서버와 통신하지 않고 프론트 자체만으로 촬영과 이미지 다운로드만 가능합니다. 링크 공유와 기록 저장, 업로드, 프레임 꾸미기 같은 서버 연동 기능은 로그인 후 사용할 수 있어요.',
        title: '지금은 촬영 체험만 가능해요',
      },
    }),
  showGuestShareNotice: () =>
    set({
      notice: {
        actions: [
          { id: 'go-login', label: '로그인하고 계속하기' },
          { id: 'dismiss', label: '닫기', variant: 'secondary' },
        ],
        eyebrow: 'DOWNLOAD ONLY',
        icon: 'sparkles-outline',
        message:
          '비회원 체험에서는 링크 공유를 지원하지 않아요. 서버를 통해 결과를 저장하고 링크로 공유하는 기능은 로그인 후 사용할 수 있습니다.',
        title: '지금은 이미지 다운로드만 가능해요',
      },
    }),
  showGuestTrialNotice: () =>
    set({
      notice: {
        actions: [
          { id: 'start-guest-trial', label: '촬영 체험 시작' },
          { id: 'go-login', label: '로그인하기', variant: 'secondary' },
        ],
        eyebrow: 'TRY HARUCUT',
        icon: 'camera-outline',
        message:
          '비회원 체험에서는 서버와 통신하지 않고 프론트 자체만으로 촬영과 이미지 다운로드만 가능합니다. 링크 공유는 불가하며, 서버를 통해야 하는 기능은 로그인 후 사용할 수 있어요.',
        title: '비회원 체험을 시작할까요?',
      },
    }),
  showNotice: (notice) => set({ notice }),
  toggleShootSelection: (id) =>
    set((state) => ({
      shoot: {
        ...state.shoot,
        selectedShotIds: limitSelection(state.shoot.selectedShotIds, id),
      },
    })),
  toggleThemeSticker: (value) =>
    set((state) => ({
      themeEditor: {
        ...state.themeEditor,
        stickers: state.themeEditor.stickers.includes(value)
          ? state.themeEditor.stickers.filter((sticker) => sticker !== value)
          : [...state.themeEditor.stickers, value],
      },
    })),
  toggleUploadSelection: (id) =>
    set((state) => ({
      upload: {
        ...state.upload,
        selectedAssetIds: limitSelection(state.upload.selectedAssetIds, id),
      },
    })),
}));
