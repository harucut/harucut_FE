"use client";

import { useEffect, useState } from "react";
import type { FrameId } from "@/constants/frames";
import { findSystemFrame } from "@/lib/fourcutCompose";
import { normalizeHexColor } from "@/lib/themeBackground";

/**
 * 기본 프레임으로 저장했을 때 **서버가 실제로 칠할 배경색**.
 *
 * 왜 필요한가 — 결과물을 서버가 그리게 되면서(`POST media/compose`) 배경은 **프레임에
 * 저장된 값**만 쓰인다. 요청 본문에는 색을 실을 자리가 아예 없다
 * (`ComposeRequest` = frameId · sourceKeys · idempotencyKey). 그런데 화면은 사용자가
 * 고른 색으로 미리보기를 그려 왔다. 그래서 **미리보기와 저장본이 다른 그림**이 됐고,
 * 색을 한 번도 안 건드려도 어긋났다 — 우리 기본값(`#23262d`)과 서버에 등록된 시스템
 * 프레임의 배경은 아무도 맞춰 준 적이 없기 때문이다.
 *
 * 여기서 서버 값을 읽어 미리보기를 사실에 맞춘다. 색을 보내는 길이 생기면
 * (백엔드에 `ComposeRequest.background` 를 요청해 뒀다) 이 훅과 잠금은 걷어내면 된다.
 *
 * 꾸민 프레임(`remoteFrameId`)은 대상이 아니다 — 그 배경은 이미 프레임에 저장돼 있고
 * `useRemoteFrameTheme` 이 읽어 온다. 비회원도 대상이 아니다 — 비회원 결과물은
 * 브라우저가 그려서 내려받으므로 고른 색이 실제로 적용된다.
 *
 * 알 수 없으면 `null` 이다(프레임을 못 찾았거나 배경이 이미지인 경우).
 * 그때는 호출부가 고른 색을 그대로 쓴다 — 틀린 색을 확신하며 보여 주는 것보다 낫다.
 */
export function useServerFrameBackground(
  frameId: FrameId | null | undefined,
  enabled: boolean,
): string | null {
  // 어느 프레임의 답인지 함께 들고 있는다. frameId 가 바뀌는 순간 이전 프레임의 색이
  // 한 프레임 동안 남으면, 미리보기가 잠깐 엉뚱한 색으로 깜빡인다.
  const [resolved, setResolved] = useState<{
    frameId: FrameId;
    color: string | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !frameId) return;

    let cancelled = false;

    void (async () => {
      try {
        const system = await findSystemFrame(frameId);
        if (cancelled) return;

        const background = system?.background;
        setResolved({
          frameId,
          color:
            background?.type === "COLOR" && background.value
              ? normalizeHexColor(background.value)
              : null,
        });
      } catch {
        if (!cancelled) setResolved({ frameId, color: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, frameId]);

  if (!enabled || !frameId) return null;
  return resolved?.frameId === frameId ? resolved.color : null;
}
