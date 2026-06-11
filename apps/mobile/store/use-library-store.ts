import { create } from 'zustand';

import { INITIAL_SAVED_FRAMES, type HistoryItem, type SavedFrame } from '@/constants/harucut-data';
import { getApiErrorMessage } from '@/lib/api-client';
import { deleteRemoteFrame, listRemoteFrames } from '@/lib/frame-api';
import { listRemoteHistoryItems, updateMediaDisplayName } from '@/lib/user-media-api';
import {
  registerWorkspaceReset,
  remoteFrameIdFromSavedId,
  upsertHistoryItem,
  type RemoteStatus,
} from '@/store/store-helpers';

// 서버에 저장된 사용자 자산(촬영 기록 + 저장 프레임)을 담당하는 스토어.
type LibraryStore = {
  frameError: string | null;
  frameStatus: RemoteStatus;
  historyError: string | null;
  historyItems: HistoryItem[];
  historyStatus: RemoteStatus;
  savedFrames: SavedFrame[];
  hardReset: () => void;
  loadRemoteFrames: () => Promise<void>;
  loadRemoteHistory: () => Promise<void>;
  removeSavedFrame: (id: string) => Promise<void>;
  renameHistoryItem: (id: string, title: string) => Promise<void>;
  upsertHistory: (nextItem: HistoryItem, existingId: string | null) => void;
};

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  frameError: null,
  frameStatus: 'idle',
  historyError: null,
  historyItems: [],
  historyStatus: 'idle',
  savedFrames: INITIAL_SAVED_FRAMES,
  hardReset: () =>
    set({
      frameError: null,
      frameStatus: 'idle',
      historyError: null,
      historyItems: [],
      historyStatus: 'idle',
      savedFrames: INITIAL_SAVED_FRAMES,
    }),
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
  removeSavedFrame: async (id) => {
    const frame = get().savedFrames.find((item) => item.id === id);
    const remoteFrameId = frame?.remoteFrameId ?? remoteFrameIdFromSavedId(id);

    if (remoteFrameId) {
      await deleteRemoteFrame(remoteFrameId);
    }

    set((state) => ({
      savedFrames: state.savedFrames.filter((item) => item.id !== id),
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
  upsertHistory: (nextItem, existingId) =>
    set((state) => ({
      historyError: null,
      historyItems: upsertHistoryItem(state.historyItems, nextItem, existingId),
      historyStatus: 'ready',
    })),
}));

registerWorkspaceReset(() => useLibraryStore.getState().hardReset());
