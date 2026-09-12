"use client";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";

type BaseSize = { width: number; height: number } | null | undefined;

/**
 * 편집 캔버스를 담긴 공간에 맞춘다.
 *
 * 이전에는 뷰 크기가 상수였다(꾸미기 340×460, 프레임 에디터 330). 그래서 320px 폰과
 * 1920px 데스크톱이 픽셀 단위로 같은 캔버스를 그렸다. 세로 4컷(2000×6000)은 어느 화면에서든
 * 153×460이라 데스크톱에서는 좌우가 텅 비고, 가로 4컷은 320px에서 캔버스가 음수 위치로 밀려
 * 왼쪽이 잘린 채 스크롤로도 닿지 않았다. 제품이 "중심"이라 부르는 화면이 그랬다.
 *
 * 컨테이너 폭은 ResizeObserver로 재고, 세로는 뷰포트에 비례해 잡는다. 첫 측정은
 * useLayoutEffect에서 동기로 읽어 페인트 전에 끝나므로 레이아웃이 튀지 않는다.
 */
export function useStageFit(
  base: BaseSize,
  options: {
    maxHeight?: number;
    /**
     * 세로 상한을 뷰포트 비율이 아니라 **컨테이너의 실측 높이**로 잡는다.
     *
     * 기본값(뷰포트 62%)은 페이지가 스크롤되는 편집 화면을 위한 것이다. 촬영 화면처럼
     * `h-dvh` 안에서 스테이지가 `flex-1` 로 남은 높이를 받는 레이아웃에서는 그 값이
     * 실제로 쓸 수 있는 높이와 무관해서, 스테이지가 제 칸을 넘거나 남긴다.
     */
    fitToContainerHeight?: boolean;
  } = {},
) {
  // 콜백 ref 를 쓴다. useRef 로 두면 컨테이너가 첫 렌더에 없다가(레이아웃 로딩 중) 나중에
  // 붙는 경우 effect 가 다시 돌지 않아 관찰자가 영영 등록되지 않는다. 실제로 프레임 에디터가
  // 그랬고, 캔버스가 통째로 안 그려졌다.
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setElement(node);
  }, []);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useLayoutEffect(() => {
    if (!element) return;

    // ResizeObserver 는 observe 직후 한 번 발화한다. 그 콜백에서만 상태를 잡아
    // 첫 측정도 같은 경로로 처리한다(effect 본문에서 동기로 setState 하지 않는다).
    const sync = () => {
      const rect = element.getBoundingClientRect();
      setContainerWidth(rect.width);
      setContainerHeight(rect.height);
      setViewportHeight(window.innerHeight);
    };

    const observer = new ResizeObserver(sync);
    observer.observe(element);
    window.addEventListener("resize", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [element]);

  const fit = useMemo(() => {
    if (!base || containerWidth <= 0) {
      return { viewW: 0, viewH: 0, scale: 1, ready: false };
    }

    // 세로 상한은 뷰포트를 따라가되 위아래로 컨트롤이 들어갈 자리를 남긴다.
    // 컨테이너가 이미 제 칸을 받아 둔 레이아웃에서는 그 실측 높이를 그대로 쓴다.
    const maxHeight =
      options.maxHeight ??
      (options.fitToContainerHeight
        ? containerHeight
        : Math.max(360, Math.min(viewportHeight * 0.62, 720)));

    if (maxHeight <= 0) {
      return { viewW: 0, viewH: 0, scale: 1, ready: false };
    }

    const scale = Math.min(containerWidth / base.width, maxHeight / base.height);

    return {
      viewW: Math.round(base.width * scale),
      viewH: Math.round(base.height * scale),
      scale,
      ready: true,
    };
  }, [
    base,
    containerWidth,
    containerHeight,
    viewportHeight,
    options.maxHeight,
    options.fitToContainerHeight,
  ]);

  return { containerRef, ...fit };
}
