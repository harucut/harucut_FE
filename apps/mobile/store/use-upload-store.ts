import { create } from 'zustand';

import type { FrameId, MediaAsset, OutputTone, SavedFrame } from '@/constants/harucut-data';
import { uploadFourcutResult } from '@/lib/user-media-api';
import {
  defaultBorderColor,
  frameName,
  limitSelection,
  registerWorkspaceReset,
  selectedMedia,
  uniqueMedia,
} from '@/store/store-helpers';
import { useLibraryStore } from '@/store/use-library-store';
import { useSessionStore } from '@/store/use-session-store';

type UploadSessionState = {
  assets: MediaAsset[];
  borderColor: string;
  frameId: FrameId;
  persistedHistoryId: string | null;
  selectedAssetIds: string[];
  selectedSavedFrameId: string | null;
  tone: OutputTone;
};

type UploadStore = UploadSessionState & {
  addUploadAssets: (assets: MediaAsset[]) => void;
  hardReset: () => void;
  persistUploadResult: (previewUri?: string | null) => Promise<string | null>;
  selectSavedFrameForUpload: (frame: SavedFrame) => void;
  setUploadFrame: (frameId: FrameId) => void;
  // 키마다 값 타입을 좁힌다. 넓은 string | boolean이면 setUploadOption('tone', true)가
  // 컴파일을 통과해 OUTPUT_TONE_OPTIONS 비교를 조용히 깨뜨린다.
  setUploadOption: <K extends 'borderColor' | 'tone'>(
    key: K,
    value: UploadSessionState[K],
  ) => void;
  toggleUploadSelection: (id: string) => void;
};

function defaultUploadSession(): UploadSessionState {
  return {
    assets: [],
    borderColor: defaultBorderColor,
    frameId: 'classic-4',
    persistedHistoryId: null,
    selectedAssetIds: [],
    selectedSavedFrameId: null,
    tone: 'NONE',
  };
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  ...defaultUploadSession(),
  addUploadAssets: (assets) =>
    set((state) => {
      const nextAssets = uniqueMedia([...state.assets, ...assets]);
      const nextSelectedIds = [...state.selectedAssetIds];

      for (const asset of assets) {
        if (nextSelectedIds.length >= 4) break;
        if (!nextSelectedIds.includes(asset.id)) {
          nextSelectedIds.push(asset.id);
        }
      }

      return {
        assets: nextAssets,
        selectedAssetIds: nextSelectedIds.slice(0, 4),
      };
    }),
  hardReset: () => set(defaultUploadSession()),
  persistUploadResult: async (previewUri) => {
    const state = get();
    const previewMedia = selectedMedia(state.assets, state.selectedAssetIds);

    if (previewMedia.length === 0) {
      return null;
    }

    if (useSessionStore.getState().accessMode !== 'member') {
      return null;
    }

    if (state.persistedHistoryId) {
      return state.persistedHistoryId;
    }

    if (!previewUri) {
      throw new Error('저장할 결과 이미지를 만들지 못했어요.');
    }

    const nextItem = await uploadFourcutResult({
      displayName: `${frameName(state.frameId)} 업로드 결과`,
      frameId: state.frameId,
      source: 'upload',
      uri: previewUri,
    });

    useLibraryStore.getState().upsertHistory(nextItem, get().persistedHistoryId);
    set({ persistedHistoryId: nextItem.id });

    return nextItem.id;
  },
  selectSavedFrameForUpload: (frame) =>
    set({
      borderColor: frame.accentColor,
      frameId: frame.frameId,
      selectedSavedFrameId: frame.id,
    }),
  setUploadFrame: (frameId) =>
    set({
      ...defaultUploadSession(),
      frameId,
      selectedSavedFrameId: null,
    }),
  setUploadOption: (key, value) => set({ [key]: value } as Partial<UploadSessionState>),
  toggleUploadSelection: (id) =>
    set((state) => ({
      selectedAssetIds: limitSelection(state.selectedAssetIds, id),
    })),
}));

registerWorkspaceReset(() => useUploadStore.getState().hardReset());
