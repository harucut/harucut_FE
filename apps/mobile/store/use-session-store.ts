import { router } from 'expo-router';
import { create } from 'zustand';

import { registerSessionExpiredHandler } from '@/lib/api-client';
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

// 비회원 체험에서 열려 있는 범위. 웹 lib/guestTrialStore.ts와 같은 문장을 쓴다.
const GUEST_ALLOWED_SCOPE =
  '비회원 체험에서는 촬영, 이미지 저장, 네컷 꾸미기를 이용할 수 있어요.';
const GUEST_MEMBER_ONLY_SCOPE =
  '링크 공유, 기록 저장, 업로드 제작은 로그인 후에 이용할 수 있어요.';

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
        message: `${GUEST_ALLOWED_SCOPE} ${GUEST_MEMBER_ONLY_SCOPE}`,
        title: '지금은 체험 기능만 이용할 수 있어요',
      },
    }),
  showGuestShareNotice: () =>
    set({
      notice: {
        actions: [
          { id: 'go-login', label: '로그인하고 계속하기' },
          { id: 'dismiss', label: '닫기', variant: 'secondary' },
        ],
        eyebrow: 'GUEST MODE',
        icon: 'sparkles-outline',
        message: `${GUEST_ALLOWED_SCOPE} ${GUEST_MEMBER_ONLY_SCOPE}`,
        title: '링크 공유는 로그인 후에 이용할 수 있어요',
      },
    }),
  showGuestTrialNotice: () =>
    set({
      notice: {
        actions: [
          { id: 'start-guest-trial', label: '무료로 체험 시작' },
          { id: 'go-login', label: '로그인하기', variant: 'secondary' },
        ],
        message:
          '가입 없이 촬영·꾸미기를 바로 체험할 수 있어요. 저장·기록 보관은 무료 가입 후 이용할 수 있어요.',
        title: '무료로 체험해볼까요?',
      },
    }),
  showNotice: (notice) => set({ notice }),
}));

// 401(액세스 토큰 만료)로 재발급까지 실패하면 회원 세션을 종료하고 로그인 화면으로 보낸다.
// api-client는 스토어를 직접 import할 수 없어(순환 참조) 레지스트리로 위임받는다.
// 회원이 아닐 때(게스트/비회원)의 401은 정상 흐름이므로 무시한다.
registerSessionExpiredHandler(() => {
  const state = useSessionStore.getState();
  if (state.accessMode !== 'member') {
    return;
  }

  state.enterAnonymousMode();
  state.showNotice({
    actions: [{ id: 'dismiss', label: '확인' }],
    eyebrow: 'SESSION',
    icon: 'lock-closed-outline',
    message: '로그인 세션이 만료되었어요. 다시 로그인해 주세요.',
    title: '다시 로그인이 필요해요',
  });
  router.replace('/login' as never);
});
