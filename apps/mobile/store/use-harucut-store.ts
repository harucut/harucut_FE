import { create } from 'zustand';

import {
  FRAME_BORDER_OPTIONS,
  INITIAL_SAVED_FRAMES,
  INITIAL_USER,
  THEME_FRAME_CANVAS,
  type FrameId,
  type HistoryItem,
  type MediaAsset,
  type OutputTone,
  type SavedFrame,
  type ThemeAsset,
  type ThemeBackground,
  type ThemeComponentStyle,
  type ThemeComponentType,
  type ThemeEditorComponent,
  type UserProfile,
} from '@/constants/harucut-data';
import type { ButtonVariant, HarucutThemePreference } from '@/constants/harucut-design';
import { getApiErrorMessage } from '@/lib/api-client';
import { deleteRemoteFrame, listRemoteFrames, createRemoteFrame, updateRemoteFrame } from '@/lib/frame-api';
import { uploadLocalFileWithPresigned } from '@/lib/file-storage-api';
import { getMyUserProfile } from '@/lib/user-api';
import { listRemoteHistoryItems, updateMediaDisplayName, uploadFourcutResult } from '@/lib/user-media-api';

type AccessMode = 'anonymous' | 'guest' | 'member';
type RemoteHistoryStatus = 'idle' | 'loading' | 'ready' | 'error';
type RemoteFrameStatus = 'idle' | 'loading' | 'ready' | 'error';

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
  activeComponentId: string | null;
  accentColor: string;
  assets: {
    photos: ThemeAsset[];
  };
  background: ThemeBackground;
  backgroundColor: string;
  caption: string;
  components: ThemeEditorComponent[];
  description: string;
  frameId: FrameId;
  selectedSavedFrameId: string | null;
  stickers: string[];
  tab: ThemeComponentType;
  title: string;
};

type ThemeComponentTransform = {
  deltaX?: number;
  deltaY?: number;
  rotationDelta?: number;
  scaleMultiplier?: number;
};

type HarucutStore = {
  accessMode: AccessMode;
  frameError: string | null;
  frameStatus: RemoteFrameStatus;
  historyError: string | null;
  historyItems: HistoryItem[];
  historyStatus: RemoteHistoryStatus;
  notice: NoticeState | null;
  shoot: ShootSession;
  themeEditor: ThemeEditorState;
  themePreference: HarucutThemePreference;
  upload: UploadSession;
  user: UserProfile;
  addShootShot: (asset: MediaAsset) => void;
  clearNotice: () => void;
  enterAnonymousMode: () => void;
  enterGuestMode: () => void;
  enterMemberMode: () => void;
  addUploadAssets: (assets: MediaAsset[]) => void;
  bootstrapMemberSession: () => Promise<void>;
  loadRemoteFrames: () => Promise<void>;
  loadRemoteHistory: () => Promise<void>;
  persistShootResult: (previewUri?: string | null) => Promise<string | null>;
  persistUploadResult: (previewUri?: string | null) => Promise<string | null>;
  refreshUserProfile: () => Promise<void>;
  removeSavedFrame: (id: string) => Promise<void>;
  renameHistoryItem: (id: string, title: string) => Promise<void>;
  resetShootSession: () => void;
  resetThemeEditor: () => void;
  resetUploadSession: () => void;
  savedFrames: SavedFrame[];
  saveThemeFrame: (previewUri?: string | null) => Promise<string | null>;
  selectSavedFrameForShoot: (frame: SavedFrame) => void;
  selectSavedFrameForTheme: (frame: SavedFrame) => void;
  selectSavedFrameForUpload: (frame: SavedFrame) => void;
  setShootFrame: (frameId: FrameId) => void;
  setShootOption: (key: keyof Pick<ShootSession, 'borderColor' | 'includeVideo' | 'tone'>, value: string | boolean) => void;
  setThemeAccentColor: (value: string) => void;
  setThemeActiveComponent: (id: string | null) => void;
  setThemeBackgroundColor: (value: string) => void;
  setThemeCaption: (value: string) => void;
  setThemeDescription: (value: string) => void;
  setThemeFrame: (frameId: FrameId) => void;
  setThemePreference: (value: HarucutThemePreference) => void;
  setThemeTab: (value: ThemeComponentType) => void;
  setThemeTitle: (value: string) => void;
  setUploadFrame: (frameId: FrameId) => void;
  setUploadOption: (key: keyof Pick<UploadSession, 'borderColor' | 'includeVideo' | 'tone'>, value: string | boolean) => void;
  setUserProfile: (next: Partial<UserProfile>) => void;
  showGuestRestrictedNotice: () => void;
  showGuestShareNotice: () => void;
  showGuestTrialNotice: () => void;
  showNotice: (notice: NoticeState) => void;
  addThemePhotoAssets: (assets: ThemeAsset[]) => void;
  addThemeComponentFromAsset: (type: 'PHOTO' | 'STICKER', source: string) => void;
  addThemeText: (text?: string) => void;
  duplicateThemeComponent: (id: string) => void;
  moveThemeComponentDown: (id: string) => void;
  moveThemeComponentUp: (id: string) => void;
  removeThemeComponent: (id: string) => void;
  removeThemePhotoAsset: (id: string) => { ok: boolean; reason?: 'IN_USE' | 'NOT_FOUND' };
  toggleThemeComponentHidden: (id: string) => void;
  toggleThemeComponentLocked: (id: string) => void;
  transformThemeComponent: (id: string, transform: ThemeComponentTransform) => void;
  updateThemeComponent: (id: string, patch: Partial<ThemeEditorComponent> & { styleJson?: ThemeComponentStyle }) => void;
  toggleShootSelection: (id: string) => void;
  toggleThemeSticker: (value: string) => void;
  toggleUploadSelection: (id: string) => void;
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeThemeColor(input: string) {
  const cleaned = input.trim().replace(/^#/, '');
  const hex = cleaned.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toLowerCase();

  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('')}`;
  }

  return `#${hex.padEnd(6, '0') || '111827'}`;
}

function normalizeThemeZ(components: ThemeEditorComponent[]) {
  return components.map((component, index) => ({ ...component, zIndex: index + 1 }));
}

function getThemeCanvas(frameId: FrameId) {
  return THEME_FRAME_CANVAS[frameId];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
const frameNames: Record<FrameId, string> = {
  'classic-4': '클래식 4컷',
  'grid-4': '2x2 그리드',
  'polaroid-4': '폴라로이드 4컷',
  'wide-4': '와이드 4컷',
};

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
  const backgroundColor = '#EEF5FF';

  return {
    activeComponentId: null,
    accentColor: '#2563EB',
    assets: {
      photos: [],
    },
    background: {
      type: 'COLOR',
      value: backgroundColor.replace(/^#/, ''),
    },
    backgroundColor,
    caption: 'today archive',
    components: [],
    description: '하루컷에서 직접 꾸민 나만의 프레임',
    frameId: 'polaroid-4',
    selectedSavedFrameId: null,
    stickers: ['✦', '♡'],
    tab: 'PHOTO',
    title: '새 테마 프레임',
  };
}

function frameName(frameId: FrameId) {
  return frameNames[frameId] ?? '하루컷 프레임';
}

function remoteFrameIdFromSavedId(id: string) {
  const value = Number(id.replace('remote-frame-', ''));
  return Number.isFinite(value) ? value : null;
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
  accessMode: 'anonymous',
  frameError: null,
  frameStatus: 'idle',
  historyError: null,
  historyItems: [],
  historyStatus: 'idle',
  notice: null,
  shoot: defaultShootSession(),
  themeEditor: defaultThemeEditor(),
  themePreference: 'system',
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
  enterAnonymousMode: () =>
    set({
      accessMode: 'anonymous',
      frameError: null,
      frameStatus: 'idle',
      historyError: null,
      historyItems: [],
      historyStatus: 'idle',
      notice: null,
      savedFrames: INITIAL_SAVED_FRAMES,
      shoot: defaultShootSession(),
      themeEditor: defaultThemeEditor(),
      upload: defaultUploadSession(),
      user: INITIAL_USER,
    }),
  enterGuestMode: () =>
    set({
      accessMode: 'guest',
      frameError: null,
      frameStatus: 'idle',
      historyError: null,
      historyItems: [],
      historyStatus: 'idle',
      notice: null,
      savedFrames: INITIAL_SAVED_FRAMES,
      shoot: defaultShootSession(),
      themeEditor: defaultThemeEditor(),
      upload: defaultUploadSession(),
    }),
  enterMemberMode: () =>
    set({
      accessMode: 'member',
      frameError: null,
      frameStatus: 'idle',
      historyError: null,
      historyItems: [],
      historyStatus: 'idle',
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
  bootstrapMemberSession: async () => {
    set({ accessMode: 'member', notice: null });
    await Promise.all([
      get().refreshUserProfile(),
      get().loadRemoteHistory(),
      get().loadRemoteFrames(),
    ]);
  },
  refreshUserProfile: async () => {
    const user = await getMyUserProfile();
    set({ user });
  },
  loadRemoteFrames: async () => {
    set({ frameError: null, frameStatus: 'loading' });

    try {
      const savedFrames = await listRemoteFrames();

      set({
        frameError: null,
        frameStatus: 'ready',
        savedFrames,
      });
    } catch (error) {
      set({
        frameError: getApiErrorMessage(error, '저장한 프레임을 불러오지 못했어요.'),
        frameStatus: 'error',
        savedFrames: [],
      });
    }
  },
  loadRemoteHistory: async () => {
    set({ historyError: null, historyStatus: 'loading' });

    try {
      const historyItems = await listRemoteHistoryItems();

      set({
        historyError: null,
        historyItems,
        historyStatus: 'ready',
      });
    } catch (error) {
      set({
        historyError: getApiErrorMessage(error, '저장한 결과를 불러오지 못했어요.'),
        historyItems: [],
        historyStatus: 'error',
      });
    }
  },
  persistShootResult: async (previewUri) => {
    const state = get();
    const previewMedia = selectedMedia(state.shoot.shots, state.shoot.selectedShotIds);

    if (previewMedia.length === 0) {
      return null;
    }

    if (state.accessMode !== 'member') {
      return null;
    }

    if (state.shoot.persistedHistoryId) {
      return state.shoot.persistedHistoryId;
    }

    if (!previewUri) {
      throw new Error('저장할 결과 이미지를 만들지 못했어요.');
    }

    const nextItem = await uploadFourcutResult({
      displayName: `${frameName(state.shoot.frameId)} 촬영 결과`,
      frameId: state.shoot.frameId,
      source: 'shoot',
      uri: previewUri,
    });

    set((current) => ({
      historyError: null,
      historyItems: upsertHistoryItem(current.historyItems, nextItem, current.shoot.persistedHistoryId),
      historyStatus: 'ready',
      shoot: {
        ...current.shoot,
        persistedHistoryId: nextItem.id,
      },
    }));

    return nextItem.id;
  },
  persistUploadResult: async (previewUri) => {
    const state = get();
    const previewMedia = selectedMedia(state.upload.assets, state.upload.selectedAssetIds);

    if (previewMedia.length === 0) {
      return null;
    }

    if (state.accessMode !== 'member') {
      return null;
    }

    if (state.upload.persistedHistoryId) {
      return state.upload.persistedHistoryId;
    }

    if (!previewUri) {
      throw new Error('저장할 결과 이미지를 만들지 못했어요.');
    }

    const nextItem = await uploadFourcutResult({
      displayName: `${frameName(state.upload.frameId)} 업로드 결과`,
      frameId: state.upload.frameId,
      source: 'upload',
      uri: previewUri,
    });

    set((current) => ({
      historyError: null,
      historyItems: upsertHistoryItem(current.historyItems, nextItem, current.upload.persistedHistoryId),
      historyStatus: 'ready',
      upload: {
        ...current.upload,
        persistedHistoryId: nextItem.id,
      },
    }));

    return nextItem.id;
  },
  removeSavedFrame: async (id) => {
    const frame = get().savedFrames.find((item) => item.id === id);
    const remoteFrameId = frame?.remoteFrameId ?? remoteFrameIdFromSavedId(id);

    if (remoteFrameId) {
      await deleteRemoteFrame(remoteFrameId);
    }

    set((state) => ({
      savedFrames: state.savedFrames.filter((item) => item.id !== id),
      themeEditor:
        state.themeEditor.selectedSavedFrameId === id
          ? { ...defaultThemeEditor(), frameId: state.themeEditor.frameId }
          : state.themeEditor,
    }));
  },
  renameHistoryItem: async (id, title) => {
    const nextTitle = title.trim();
    const item = get().historyItems.find((historyItem) => historyItem.id === id);

    if (!nextTitle) {
      return;
    }

    if (item?.mediaId) {
      const updated = await updateMediaDisplayName(item.mediaId, nextTitle);
      const updatedTitle = updated.displayName?.trim() || updated.displayname?.trim() || nextTitle;

      set((state) => ({
        historyItems: state.historyItems.map((historyItem) =>
          historyItem.id === id ? { ...historyItem, title: updatedTitle } : historyItem,
        ),
      }));
      return;
    }

    set((state) => ({
      historyItems: state.historyItems.map((historyItem) =>
        historyItem.id === id ? { ...historyItem, title: nextTitle } : historyItem,
      ),
    }));
  },
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
  saveThemeFrame: async (previewUri) => {
    const state = get();
    const current = state.themeEditor;
    const title = current.title.trim() || '새 테마 프레임';

    if (!previewUri) {
      throw new Error('프레임 미리보기를 만들지 못했어요.');
    }

    const uploaded = await uploadLocalFileWithPresigned({
      contentType: 'JPEG',
      filename: `${title}.jpg`,
      isTemp: false,
      type: 'FRAME',
      uri: previewUri,
    });

    const selectedFrame = current.selectedSavedFrameId
      ? state.savedFrames.find((frame) => frame.id === current.selectedSavedFrameId)
      : null;
    const remoteFrameId =
      selectedFrame?.remoteFrameId ??
      (current.selectedSavedFrameId ? remoteFrameIdFromSavedId(current.selectedSavedFrameId) : null);
    const draft = {
      accentColor: current.accentColor,
      background: current.background,
      backgroundColor: current.backgroundColor,
      caption: current.caption,
      components: normalizeThemeZ(current.components)
        .filter((component) => !component.hidden)
        .map(({ hidden, locked, ...component }) => component),
      description: current.description,
      frameId: current.frameId,
      previewKey: uploaded.key,
      stickers: current.stickers,
      title,
    };

    if (remoteFrameId) {
      await updateRemoteFrame(remoteFrameId, draft);
    } else {
      await createRemoteFrame(draft);
    }

    await get().loadRemoteFrames();

    const nextFrame = get().savedFrames.find((frame) => {
      if (remoteFrameId) return frame.remoteFrameId === remoteFrameId;
      return frame.title === title && frame.previewKey === uploaded.key;
    });
    const id = nextFrame?.id ?? current.selectedSavedFrameId ?? null;

    if (id) {
      set((store) => ({
        themeEditor: {
          ...store.themeEditor,
          selectedSavedFrameId: id,
        },
      }));
    }

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
        ...defaultThemeEditor(),
        activeComponentId: null,
        accentColor: frame.accentColor,
        assets: {
          photos: [],
        },
        background: frame.background ?? {
          type: 'COLOR',
          value: normalizeThemeColor(frame.backgroundColor).replace(/^#/, ''),
        },
        backgroundColor: frame.backgroundColor,
        caption: frame.caption,
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
        stickers: frame.stickers,
        tab: 'PHOTO',
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
  setThemeActiveComponent: (id) =>
    set((state) => ({ themeEditor: { ...state.themeEditor, activeComponentId: id } })),
  setThemeBackgroundColor: (value) =>
    set((state) => {
      const backgroundColor = normalizeThemeColor(value);

      return {
        themeEditor: {
          ...state.themeEditor,
          background: {
            type: 'COLOR',
            value: backgroundColor.replace(/^#/, ''),
          },
          backgroundColor,
        },
      };
    }),
  setThemeCaption: (value) =>
    set((state) => ({ themeEditor: { ...state.themeEditor, caption: value } })),
  setThemeDescription: (value) =>
    set((state) => ({ themeEditor: { ...state.themeEditor, description: value } })),
  setThemeFrame: (frameId) =>
    set((state) => ({
      themeEditor: { ...defaultThemeEditor(), frameId, selectedSavedFrameId: null },
    })),
  setThemePreference: (value) => set({ themePreference: value }),
  setThemeTab: (value) =>
    set((state) => ({ themeEditor: { ...state.themeEditor, tab: value } })),
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
          '비회원 체험에서는 촬영과 이미지 다운로드만 가능합니다. 링크 공유나, 추가 기능들은 로그인 후에 사용할 수 있어요!',
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
          '비회원 체험에서는 촬영과 이미지 다운로드만 가능합니다. 링크 공유나, 추가 기능들은 로그인 후에 사용할 수 있어요!',
        title: '비회원 체험을 시작할까요?',
      },
    }),
  showNotice: (notice) => set({ notice }),
  addThemePhotoAssets: (assets) =>
    set((state) => ({
      themeEditor: {
        ...state.themeEditor,
        assets: {
          ...state.themeEditor.assets,
          photos: [...assets, ...state.themeEditor.assets.photos],
        },
        tab: 'PHOTO',
      },
    })),
  addThemeComponentFromAsset: (type, source) =>
    set((state) => {
      const canvas = getThemeCanvas(state.themeEditor.frameId);
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
        themeEditor: {
          ...state.themeEditor,
          activeComponentId: id,
          components: normalizeThemeZ([...state.themeEditor.components, component]),
        },
      };
    }),
  addThemeText: (text) =>
    set((state) => {
      const canvas = getThemeCanvas(state.themeEditor.frameId);
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
        themeEditor: {
          ...state.themeEditor,
          activeComponentId: id,
          components: normalizeThemeZ([...state.themeEditor.components, component]),
          tab: 'TEXT',
        },
      };
    }),
  duplicateThemeComponent: (id) =>
    set((state) => {
      const source = state.themeEditor.components.find((component) => component.id === id);
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
        themeEditor: {
          ...state.themeEditor,
          activeComponentId: copy.id,
          components: normalizeThemeZ([...state.themeEditor.components, copy]),
        },
      };
    }),
  moveThemeComponentDown: (id) =>
    set((state) => {
      const index = state.themeEditor.components.findIndex((component) => component.id === id);
      if (index <= 0) return state;

      const components = [...state.themeEditor.components];
      [components[index - 1], components[index]] = [components[index], components[index - 1]];

      return {
        themeEditor: {
          ...state.themeEditor,
          components: normalizeThemeZ(components),
        },
      };
    }),
  moveThemeComponentUp: (id) =>
    set((state) => {
      const index = state.themeEditor.components.findIndex((component) => component.id === id);
      if (index < 0 || index >= state.themeEditor.components.length - 1) return state;

      const components = [...state.themeEditor.components];
      [components[index], components[index + 1]] = [components[index + 1], components[index]];

      return {
        themeEditor: {
          ...state.themeEditor,
          components: normalizeThemeZ(components),
        },
      };
    }),
  removeThemeComponent: (id) =>
    set((state) => ({
      themeEditor: {
        ...state.themeEditor,
        activeComponentId:
          state.themeEditor.activeComponentId === id ? null : state.themeEditor.activeComponentId,
        components: normalizeThemeZ(
          state.themeEditor.components.filter((component) => component.id !== id),
        ),
      },
    })),
  removeThemePhotoAsset: (id) => {
    const state = get();
    const asset = state.themeEditor.assets.photos.find((photo) => photo.id === id);
    if (!asset) return { ok: false, reason: 'NOT_FOUND' as const };

    const inUse = state.themeEditor.components.some(
      (component) => component.type === 'PHOTO' && component.source === asset.uri,
    );
    if (inUse) return { ok: false, reason: 'IN_USE' as const };

    set((current) => ({
      themeEditor: {
        ...current.themeEditor,
        assets: {
          ...current.themeEditor.assets,
          photos: current.themeEditor.assets.photos.filter((photo) => photo.id !== id),
        },
      },
    }));

    return { ok: true };
  },
  toggleThemeComponentHidden: (id) =>
    set((state) => ({
      themeEditor: {
        ...state.themeEditor,
        components: state.themeEditor.components.map((component) =>
          component.id === id ? { ...component, hidden: !component.hidden } : component,
        ),
      },
    })),
  toggleThemeComponentLocked: (id) =>
    set((state) => ({
      themeEditor: {
        ...state.themeEditor,
        components: state.themeEditor.components.map((component) =>
          component.id === id ? { ...component, locked: !component.locked } : component,
        ),
      },
    })),
  transformThemeComponent: (id, transform) =>
    set((state) => ({
      themeEditor: {
        ...state.themeEditor,
        activeComponentId: id,
        components: state.themeEditor.components.map((component) => {
          if (component.id !== id || component.locked) return component;

          return {
            ...component,
            rotation: component.rotation + (transform.rotationDelta ?? 0),
            scale: clamp(component.scale * (transform.scaleMultiplier ?? 1), 0.2, 3),
            x: component.x + (transform.deltaX ?? 0),
            y: component.y + (transform.deltaY ?? 0),
          };
        }),
      },
    })),
  updateThemeComponent: (id, patch) =>
    set((state) => ({
      themeEditor: {
        ...state.themeEditor,
        components: state.themeEditor.components.map((component) => {
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
      },
    })),
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
