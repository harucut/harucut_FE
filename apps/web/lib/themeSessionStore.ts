import { create } from "zustand";
import type { FrameId } from "@/constants/frames";

type ThemeSessionState = {
  frameId: FrameId | null;
  remoteFrameId: number | null;
  /**
   * 행사용 프레임을 만드는 조직 공간(Studio 에서 열었을 때). 새 프레임을 이 공간에 만든다 —
   * 개인 요금제 한도를 받지 않고, 공간 멤버가 함께 고친다(백엔드 fork #18). 개인 편집이면 null.
   */
  workspaceId: string | null;
  /** 저장·나가기 뒤 돌아갈 곳. 없으면 프레임 목록(/theme). */
  returnTo: string | null;
  setFrameId: (id: FrameId | null) => void;
  setRemoteFrameId: (id: number | null) => void;
  setWorkspaceContext: (workspaceId: string | null, returnTo: string | null) => void;
  reset: () => void;
};

export const useThemeSession = create<ThemeSessionState>((set) => ({
  frameId: null,
  remoteFrameId: null,
  workspaceId: null,
  returnTo: null,
  setFrameId: (id) => set({ frameId: id }),
  setRemoteFrameId: (id) => set({ remoteFrameId: id }),
  setWorkspaceContext: (workspaceId, returnTo) => set({ workspaceId, returnTo }),
  reset: () => set({ frameId: null, remoteFrameId: null, workspaceId: null, returnTo: null }),
}));
