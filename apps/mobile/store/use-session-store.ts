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
  endExpiredSession: () => void;
  enterAnonymousMode: () => void;
  enterGuestMode: () => void;
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

// 지금 작업 공간(촬영/업로드/꾸미기)에 남아 있는 결과물의 주인. 세션이 만료돼도 작업 공간은
// 비우지 않으므로, 재로그인 때 "같은 사람인가"를 판단할 기준이 필요하다.
// 작업 공간을 실제로 비운 순간(로그아웃/탈퇴/게스트 전환)에는 null로 되돌린다.
let workspaceOwner: string | null = null;

// 로그인한 계정이 작업 공간 주인과 다르면 이전 사용자의 로컬 결과물을 비운다.
// 서버가 덮어써 주는 라이브러리와 달리 촬영/업로드/꾸미기 사진은 로컬에만 있어서,
// 계정이 바뀌었는데 남겨 두면 다른 사람의 사진을 새 계정으로 저장할 수 있다.
function claimWorkspace(user: UserProfile) {
  const identity = user.email.trim().toLowerCase() || null;

  // 식별자를 얻지 못한 경우(계약 위반 응답)도 "같은 사람임을 증명 못 함"으로 보고 비운다.
  if (workspaceOwner !== null && workspaceOwner !== identity) {
    resetAllWorkspaces();
  }

  workspaceOwner = identity;
}

// 작업 공간을 비우는 경로에서 호출한다. 주인이 사라지면 다음 로그인은 계정 비교 없이
// 그대로 이어받는다(게스트 체험 결과물을 로그인 후에도 저장할 수 있어야 한다).
function releaseWorkspace() {
  resetAllWorkspaces();
  workspaceOwner = null;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  accessMode: 'anonymous',
  notice: null,
  themePreference: 'system',
  user: INITIAL_USER,
  bootstrapMemberSession: async () => {
    set({ accessMode: 'member', notice: null });

    // 프로필(=계정 식별)을 먼저 확정한다. 계정이 바뀌었을 때의 작업 공간 초기화가
    // 라이브러리 조회보다 늦게 돌면 방금 불러온 기록/프레임까지 지워 버린다.
    await get().refreshUserProfile();
    claimWorkspace(get().user);

    const library = useLibraryStore.getState();
    await Promise.all([library.loadRemoteHistory(), library.loadRemoteFrames()]);
  },
  clearNotice: () => set({ notice: null }),
  // 401 하드 만료 전용 종료 경로. 로그아웃/탈퇴와 달리 작업 공간(촬영/업로드/꾸미기)은 남긴다.
  endExpiredSession: () => {
    // 만료된 계정의 서버 캐시(기록·저장 프레임)는 남기면 안 되므로 비운다.
    // 로컬 작업물은 재로그인 후 이어서 저장할 수 있도록 유지하고,
    // 다른 계정으로 로그인하면 bootstrapMemberSession의 claimWorkspace가 그때 비운다.
    useLibraryStore.getState().hardReset();
    // accessMode/user 초기화는 app/_layout.tsx의 (app) 그룹 가드가 화면을 내리는 조건이라 필수다.
    set({
      accessMode: 'anonymous',
      notice: null,
      user: INITIAL_USER,
    });
  },
  // 명시적 이탈(로그아웃/탈퇴)과 공개 화면 복귀. 사용자의 의사이므로 작업 공간까지 비운다.
  enterAnonymousMode: () => {
    releaseWorkspace();
    set({
      accessMode: 'anonymous',
      notice: null,
      user: INITIAL_USER,
    });
  },
  enterGuestMode: () => {
    releaseWorkspace();
    set({
      accessMode: 'guest',
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
// 작업 공간을 비우지 않는 이유는 endExpiredSession 주석 참고 — 만료는 사용자의 의사가 아니므로
// 촬영/업로드/꾸미기 결과물을 날리지 않고, 재로그인 후 이어서 저장할 수 있게 둔다.
registerSessionExpiredHandler(() => {
  const state = useSessionStore.getState();
  if (state.accessMode !== 'member') {
    return;
  }

  state.endExpiredSession();
  state.showNotice({
    actions: [{ id: 'dismiss', label: '확인' }],
    eyebrow: 'SESSION',
    icon: 'lock-closed-outline',
    message: '로그인 세션이 만료되었어요. 다시 로그인해 주세요.',
    title: '다시 로그인이 필요해요',
  });
  router.replace('/login' as never);
});
