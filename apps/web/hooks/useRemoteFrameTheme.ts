"use client";

import { useCallback, useEffect, useState } from "react";
import type { FrameId } from "@/constants/frames";
import { toThemeExportJson } from "@/lib/frameApi";
import { resolveThemeAssetUrls } from "@/lib/frameAssets";
import { getImageUrlByKey } from "@/lib/presignedUploadApi";
import { getFrame } from "@/lib/remoteFrameApi";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

export type RemoteFrameThemeState = {
  /** 프레임 내용. 꾸민 프레임을 안 쓰거나, 아직 못 읽었거나, 못 읽게 됐으면 null 이다. */
  data: ThemeExportJson | null;
  /**
   * **조회가 실패했을 때만** 채워진다. 화면이 "꾸민 프레임을 안 쓴다"와 "못 읽었다"를
   * 구분해야 하기 때문이다 — 둘 다 data 는 null 이지만 결과물은 정반대다.
   * 서버 합성은 remoteFrameId 가 있으면 프레임에 저장된 배경을 쓰고 보낸 색을 버린다
   * (lib/fourcutCompose.ts 의 usesStoredBackground). 그러니 못 읽은 것을 "안 쓴다"로
   * 착각해 배경색 고르기를 열어 주면, 사용자가 고른 색은 조용히 사라진다.
   *
   * 읽어 온 프레임이 화면이 기대한 frameId 와 다른 경우는 실패가 아니라 그냥 "이 화면에는
   * 안 쓴다"이므로 여기에 담지 않는다.
   */
  error: unknown;
  isLoading: boolean;
  /** 실패한 조회를 다시 시도한다. */
  reload: () => void;
};

type LoadState = Omit<RemoteFrameThemeState, "reload">;

/**
 * 꾸민 프레임의 내용을 읽어 온다. 성공·실패·진행 중을 **따로** 알려 준다.
 */
export function useRemoteFrameThemeState(
  remoteFrameId: number | null | undefined,
  expectedFrameId?: FrameId | null,
): RemoteFrameThemeState {
  const [state, setState] = useState<LoadState>(() => ({
    data: null,
    // 프레임을 쓰는 화면이 첫 그림에서 "다 읽었는데 내용이 없다"로 보이면 안 된다.
    // 조회는 effect 에서 시작하므로 그 전에 이미 진행 중인 것으로 둔다.
    isLoading: Boolean(remoteFrameId),
    error: null,
  }));
  const [reloadNonce, setReloadNonce] = useState(0);

  // 실제로 다시 조회하려면 effect 의 의존성을 흔들어야 한다. 상태만 바꾸면 아무 일도 안 난다.
  const reload = useCallback(() => {
    setReloadNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      if (!remoteFrameId) {
        setState({ data: null, isLoading: false, error: null });
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const frame = await getFrame(remoteFrameId);
        if (cancelled) return;

        const nextTheme = toThemeExportJson(frame);
        if (expectedFrameId && nextTheme.frameId !== expectedFrameId) {
          setState({ data: null, isLoading: false, error: null });
          return;
        }

        // IMAGE 배경은 key만 오므로 렌더용 URL을 해석해 붙인다(실패 시 색 폴백).
        if (
          nextTheme.background?.type === "IMAGE" &&
          nextTheme.background.key &&
          !nextTheme.background.url
        ) {
          const url = await getImageUrlByKey(nextTheme.background.key);
          if (cancelled) return;
          if (url) {
            nextTheme.background = { ...nextTheme.background, url };
          }
        }

        // 컴포넌트 자산도 key 로 저장돼 있어 그릴 주소를 붙여야 한다(배경과 같은 이유).
        const withAssets = await resolveThemeAssetUrls(nextTheme);
        if (cancelled) return;

        setState({ data: withAssets, isLoading: false, error: null });
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setState({ data: null, isLoading: false, error });
        }
      }
    }

    void loadTheme();

    return () => {
      cancelled = true;
    };
  }, [expectedFrameId, reloadNonce, remoteFrameId]);

  return { ...state, reload };
}

/**
 * 내용만 있으면 되는 화면을 위한 껍데기(그리기·색 폴백처럼 실패와 없음이 같은 뜻인 곳).
 * 실패를 알아야 하는 화면은 useRemoteFrameThemeState 를 쓴다.
 */
export function useRemoteFrameTheme(
  remoteFrameId: number | null | undefined,
  expectedFrameId?: FrameId | null,
): ThemeExportJson | null {
  return useRemoteFrameThemeState(remoteFrameId, expectedFrameId).data;
}
