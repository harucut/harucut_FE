import { create } from 'zustand';

import type { FrameId, MediaAsset, OutputTone, SavedFrame } from '@/constants/harucut-data';
import { uploadFourcutResult } from '@/lib/user-media-api';
import {
  defaultBorderColor,
  frameName,
  limitSelection,
  registerWorkspaceReset,
  selectedMedia,
} from '@/store/store-helpers';
import { useLibraryStore } from '@/store/use-library-store';
import { useSessionStore } from '@/store/use-session-store';

type ShootSessionState = {
  borderColor: string;
  frameId: FrameId | null;
  persistedHistoryId: string | null;
  selectedSavedFrameId: string | null;
  selectedShotIds: string[];
  shots: MediaAsset[];
  tone: OutputTone;
};

type ShootStore = ShootSessionState & {
  addShootShot: (asset: MediaAsset) => void;
  hardReset: () => void;
  persistShootResult: (previewUri?: string | null) => Promise<string | null>;
  resetShootSession: () => void;
  selectSavedFrameForShoot: (frame: SavedFrame) => void;
  setShootFrame: (frameId: FrameId | null) => void;
  // 키마다 값 타입을 좁힌다. 넓은 string | boolean이면 setShootOption('tone', true)가
  // 컴파일을 통과해 OUTPUT_TONE_OPTIONS 비교를 조용히 깨뜨린다.
  setShootOption: <K extends 'borderColor' | 'tone'>(
    key: K,
    value: ShootSessionState[K],
  ) => void;
  toggleShootSelection: (id: string) => void;
};

function defaultShootSession(): ShootSessionState {
  return {
    borderColor: defaultBorderColor,
    frameId: null,
    persistedHistoryId: null,
    selectedSavedFrameId: null,
    selectedShotIds: [],
    shots: [],
    tone: 'NONE',
  };
}

export const useShootStore = create<ShootStore>((set, get) => ({
  ...defaultShootSession(),
  addShootShot: (asset) =>
    set((state) => {
      const shots = [...state.shots, asset].slice(-8);
      const selectedShotIds =
        state.selectedShotIds.length < 4
          ? [...state.selectedShotIds, asset.id].slice(0, 4)
          : state.selectedShotIds;

      return {
        selectedShotIds,
        shots,
      };
    }),
  hardReset: () => set(defaultShootSession()),
  persistShootResult: async (previewUri) => {
    const state = get();
    const previewMedia = selectedMedia(state.shots, state.selectedShotIds);

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

    if (!state.frameId) {
      throw new Error('촬영할 프레임을 선택해 주세요.');
    }

    const frameId = state.frameId;

    const nextItem = await uploadFourcutResult({
      displayName: `${frameName(frameId)} 촬영 결과`,
      frameId,
      source: 'shoot',
      uri: previewUri,
    });

    useLibraryStore.getState().upsertHistory(nextItem, get().persistedHistoryId);
    set({ persistedHistoryId: nextItem.id });

    return nextItem.id;
  },
  resetShootSession: () =>
    set((state) => ({
      ...defaultShootSession(),
      // 촬영 시작 시 세션(촬영본/선택)만 초기화하고 고른 프레임(저장 프레임 포함)은 유지한다.
      // 촬영 프리뷰의 슬롯 비율과 배치·결과 단계의 프레임 표시가 이 값에 의존한다.
      borderColor: state.borderColor,
      frameId: state.frameId,
      selectedSavedFrameId: state.selectedSavedFrameId,
    })),
  selectSavedFrameForShoot: (frame) =>
    set({
      ...defaultShootSession(),
      borderColor: frame.accentColor,
      frameId: frame.frameId,
      selectedSavedFrameId: frame.id,
    }),
  setShootFrame: (frameId) =>
    set({
      ...defaultShootSession(),
      frameId,
      selectedSavedFrameId: null,
    }),
  setShootOption: (key, value) => set({ [key]: value } as Partial<ShootSessionState>),
  toggleShootSelection: (id) =>
    set((state) => ({
      selectedShotIds: limitSelection(state.selectedShotIds, id),
    })),
}));

registerWorkspaceReset(() => useShootStore.getState().hardReset());
