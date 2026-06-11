import { create } from 'zustand';

import { INITIAL_USER, type UserProfile } from '@/constants/harucut-data';
import type { HarucutThemePreference } from '@/constants/harucut-design';
import { getMyUserProfile } from '@/lib/user-api';
import {
  resetAllWorkspaces,
  type AccessMode,
  type NoticeState,
} from '@/store/store-helpers';
import { useLibraryStore } from '@/store/use-library-store';

// 접근 모드/사용자/전역 공지/테마 설정을 담당하는 스토어.
type SessionStore = {
  accessMode: AccessMode;
  notice: NoticeState | null;
  themePreference: HarucutThemePreference;
  user: UserProfile;
  bootstrapMemberSession: () => Promise<void>;
  clearNotice: () => void;
  enterAnonymousMode: () => void;
  enterGuestMode: () => void;
  enterMemberMode: () => void;
  refreshUserProfile: () => Promise<void>;
  setThemePreference: (value: HarucutThemePreference) => void;
  setUserProfile: (next: Partial<UserProfile>) => void;
  showGuestRestrictedNotice: () => void;
  showGuestShareNotice: () => void;
  showGuestTrialNotice: () => void;
  showNotice: (notice: NoticeState) => void;
};

export const useSessionStore = create<SessionStore>((set, get) => ({
  accessMode: 'anonymous',
  notice: null,
  themePreference: 'system',
  user: INITIAL_USER,
  bootstrapMemberSession: async () => {
    set({ accessMode: 'member', notice: null });

    const library = useLibraryStore.getState();
    await Promise.all([
      get().refreshUserProfile(),
      library.loadRemoteHistory(),
      library.loadRemoteFrames(),
    ]);
  },
  clearNotice: () => set({ notice: null }),
  enterAnonymousMode: () => {
    resetAllWorkspaces();
    set({
      accessMode: 'anonymous',
      notice: null,
      user: INITIAL_USER,
    });
  },
  enterGuestMode: () => {
    resetAllWorkspaces();
    set({
      accessMode: 'guest',
      notice: null,
    });
  },
  enterMemberMode: () => {
    useLibraryStore.getState().hardReset();
    set({
      accessMode: 'member',
      notice: null,
    });
  },
  refreshUserProfile: async () => {
    const user = await getMyUserProfile();
    set({ user });
  },
  setThemePreference: (value) => set({ themePreference: value }),
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
}));
