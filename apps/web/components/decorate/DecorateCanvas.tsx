"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Line,
  Image as KonvaImage,
  Transformer,
} from "@/lib/reactKonva";
import Konva from "konva";

import { useStageFit } from "@/hooks/useStageFit";
import { useDecorateStore } from "@/lib/decorateStore";
import { EditableNode } from "@/components/theme/editor/canvas/EditableNode";

/** lg(1024px) 이상인지. 도구 패널이 옆으로 붙는 기준과 같다. */
function useIsWideViewport() {
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return isWide;
}

/** 캔버스에 허용할 세로 상한. 뷰포트가 바뀌면 같이 바뀐다. */
function useMaxStageHeight(isWide: boolean) {
  const [viewportHeight, setViewportHeight] = useState(0);
  useEffect(() => {
    const sync = () => setViewportHeight(window.innerHeight);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  if (viewportHeight <= 0) return undefined;
  return isWide
    ? Math.max(360, Math.min(viewportHeight * 0.68, 720))
    : Math.max(240, Math.min(viewportHeight * 0.38, 420));
}

export function DecorateCanvas() {
  const base = useDecorateStore((s) => s.base);
  const components = useDecorateStore((s) => s.components);
  const strokes = useDecorateStore((s) => s.strokes);
  const activeId = useDecorateStore((s) => s.activeId);
  const mode = useDecorateStore((s) => s.mode);
  const drawColor = useDecorateStore((s) => s.drawColor);
  const drawWidth = useDecorateStore((s) => s.drawWidth);
  const renderKey = useDecorateStore((s) => s.renderKey);
  const setActive = useDecorateStore((s) => s.setActive);
  const update = useDecorateStore((s) => s.updateComponent);
  const addStroke = useDecorateStore((s) => s.addStroke);
  const bumpRenderKey = useDecorateStore((s) => s.bumpRenderKey);
  const removeActive = useDecorateStore((s) => s.removeActive);

  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  // 그리는 중인 선은 React 상태로 들고 있지 않는다. 포인터가 움직일 때마다 상태를 갱신하면
  // 매 프레임 캔버스 전체가 리렌더되고 Konva 가 모든 노드를 다시 맞춘다(실측 22~27fps).
  // 좌표는 ref 에 쌓고 Konva Line 을 직접 갱신한 뒤, 손을 뗄 때만 스토어에 커밋한다.
  const draftPointsRef = useRef<number[]>([]);
  const draftLineRef = useRef<Konva.Line | null>(null);
  const isDrawingRef = useRef(false);

  const stageRef = useRef<Konva.Stage | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);

  // base가 사라지면 렌더 중에 즉시 비운다(effect에서 setState 하면 렌더가 한 번 더 돈다).
  if (!base && baseImage) {
    setBaseImage(null);
  }

  useEffect(() => {
    if (!base) return;

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    let active = true;
    img.onload = () => {
      if (active) setBaseImage(img);
    };
    img.onerror = () => {
      if (active) setBaseImage(null);
    };
    img.src = base.src;
    return () => {
      active = false;
    };
  }, [base]);

  // 캔버스는 이제 한 화면 안의 고정 자리에 산다. 모바일에서는 도구 패널이 아래에 붙으므로
  // 높이의 38%까지만 쓰고, 도구가 옆으로 가는 lg 부터는 예전처럼 넉넉히 쓴다.
  const isWide = useIsWideViewport();
  const maxHeight = useMaxStageHeight(isWide);
  const { containerRef, viewW, viewH, scale, ready } = useStageFit(base, { maxHeight });

  const activeComponent = useMemo(
    () => components.find((c) => c.id === activeId) ?? null,
    [components, activeId],
  );

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    if (!activeId || mode === "draw") {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    // react-konva 19.2.5부터 리컨사일러 커밋이 queueMicrotask로 미뤄질 수 있다(19.2.1까지는 동기).
    // 그래서 이 시점에 자식이 만든 Konva 노드가 아직 스테이지에 없을 수 있고, 예전처럼 한 번 찾고
    // 포기하면 선택 핸들이 조용히 안 뜬다. 붙을 때까지 다음 프레임에 다시 시도하되,
    // 없는 id를 계속 좇지 않도록 시도 횟수를 제한한다.
    let frame = 0;
    let attempts = 0;

    const attach = () => {
      const node = stage.findOne(`#node-${activeId}`);
      if (!node) {
        // 약 0.5초(30프레임)까지만 기다린다. 그 뒤엔 예전과 같이 조용히 포기한다.
        if (attempts++ >= 30) return;
        frame = requestAnimationFrame(attach);
        return;
      }

      tr.nodes([node]);
      tr.forceUpdate();
      tr.getLayer()?.batchDraw();
    };

    attach();

    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [activeId, renderKey, mode]);

  const sorted = useMemo(
    () => [...components].sort((a, b) => a.zIndex - b.zIndex),
    [components],
  );

  if (!base) return null;

  const pointerToBase = (): [number, number] | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return [pos.x / scale, pos.y / scale];
  };

  const paintDraft = () => {
    const line = draftLineRef.current;
    if (!line) return;
    line.points(draftPointsRef.current);
    line.getLayer()?.batchDraw();
  };

  const startDraw = () => {
    const p = pointerToBase();
    if (!p) return;
    isDrawingRef.current = true;
    draftPointsRef.current = [p[0], p[1]];
    paintDraft();
  };
  const moveDraw = () => {
    if (!isDrawingRef.current) return;
    const p = pointerToBase();
    if (!p) return;
    draftPointsRef.current.push(p[0], p[1]);
    paintDraft();
  };
  const endDraw = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const points = draftPointsRef.current;
    draftPointsRef.current = [];
    paintDraft();
    if (points.length >= 4) addStroke(points);
  };

  /**
   * 캔버스를 키보드로도 다룬다.
   *
   * 이 편집기는 포인터로만 쓸 수 있었다. Tab 으로는 캔버스에 들어갈 수조차 없어서
   * 스티커를 고르는 것도, 옮기는 것도, 지우는 것도 불가능했다. WCAG 2.1.1(키보드)
   * 위반이자, 마우스를 못 쓰는 사람에게는 화면 전체가 잠긴 것과 같다.
   *
   * 화살표로 옮기고(Shift 로 크게), Delete 로 지우고, Tab 순환 대신 대괄호로 스티커를
   * 옮겨 고른다. Escape 로 선택을 푼다. 조작법은 캔버스 아래에 글로도 적어 둔다.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (mode === "draw") return;

    const ordered = sorted;
    if (ordered.length === 0) return;

    // 선택 이동: 대괄호. Tab 을 쓰면 캔버스를 빠져나갈 방법이 없어진다.
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const current = ordered.findIndex((c) => c.id === activeId);
      const step = event.key === "]" ? 1 : -1;
      const nextIndex =
        current === -1
          ? step === 1
            ? 0
            : ordered.length - 1
          : (current + step + ordered.length) % ordered.length;
      setActive(ordered[nextIndex].id);
      return;
    }

    if (event.key === "Escape") {
      if (!activeId) return;
      event.preventDefault();
      setActive(null);
      return;
    }

    if (!activeId) {
      // 아직 아무것도 안 골랐는데 화살표를 누르면 첫 스티커부터 고른다.
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        setActive(ordered[0].id);
      }
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeActive();
      return;
    }

    const target = components.find((c) => c.id === activeId);
    if (!target) return;

    // 이동 폭은 그림 크기에 비례한다 — 2000px 캔버스에서 1px 씩 옮기면 끝이 없다.
    const step = (event.shiftKey ? 0.05 : 0.01) * Math.max(base.width, base.height);
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const delta = deltas[event.key];
    if (!delta) return;

    event.preventDefault();
    update(activeId, { x: target.x + delta[0], y: target.y + delta[1] });
  };

  const deselectIfBase = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage() || e.target.name() === "base") {
      setActive(null);
    }
  };

  return (
    <div ref={containerRef} className="flex w-full flex-col items-center gap-2">
      {/*
        role="application" 로 두어 스크린리더가 자체 단축키를 가로채지 않고 화살표를
        그대로 흘려보내게 한다. 조작법은 aria-describedby 로 읽어 주고, 같은 내용을
        눈으로도 보이게 아래에 적는다.
      */}
      <div
        tabIndex={0}
        role="application"
        aria-label="네컷 꾸미기 캔버스"
        aria-describedby="decorate-canvas-help"
        onKeyDown={handleKeyDown}
        className="rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--hc-primary)]"
      >
      {ready ? (
      <Stage
        ref={stageRef}
        width={viewW}
        height={viewH}
        scaleX={scale}
        scaleY={scale}
        className="block touch-none rounded-2xl bg-zinc-950"
        onMouseDown={(e) => {
          if (mode === "draw") {
            startDraw();
            return;
          }
          deselectIfBase(e);
        }}
        onMouseMove={() => {
          if (mode === "draw") moveDraw();
        }}
        onMouseUp={() => {
          if (mode === "draw") endDraw();
        }}
        onTouchStart={(e) => {
          if (mode === "draw") {
            startDraw();
            return;
          }
          deselectIfBase(e);
        }}
        onTouchMove={() => {
          if (mode === "draw") moveDraw();
        }}
        onTouchEnd={() => {
          if (mode === "draw") endDraw();
        }}
      >
        {/* 1) 베이스 네컷 */}
        <Layer listening={mode !== "draw"}>
          {baseImage ? (
            <KonvaImage
              name="base"
              image={baseImage}
              x={0}
              y={0}
              width={base.width}
              height={base.height}
              cornerRadius={24}
            />
          ) : null}
        </Layer>

        {/* 2) 자유 드로잉 */}
        <Layer listening={false}>
          {strokes.map((stroke) => (
            <Line
              key={stroke.id}
              points={stroke.points}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              lineCap="round"
              lineJoin="round"
              tension={0.3}
            />
          ))}
          {/* 그리는 중인 선. points 는 React 가 아니라 위 paintDraft 가 직접 넣는다. */}
          <Line
            ref={draftLineRef}
            points={[]}
            stroke={drawColor}
            strokeWidth={drawWidth}
            lineCap="round"
            lineJoin="round"
            tension={0.3}
          />
        </Layer>

        {/* 3) 스티커 / 텍스트 */}
        <Layer listening={mode === "select"}>
          {sorted.map((c) => (
            <EditableNode
              key={c.id}
              c={c}
              isActive={c.id === activeId}
              onSelect={() => setActive(c.id)}
              onCommit={(patch) => update(c.id, patch)}
              onAssetReady={bumpRenderKey}
            />
          ))}

          <Transformer
            ref={trRef}
            rotateEnabled
            flipEnabled={false}
            enabledAnchors={
              activeComponent?.type === "TEXT"
                ? []
                : ["top-left", "top-right", "bottom-left", "bottom-right"]
            }
            keepRatio={activeComponent?.type !== "TEXT"}
            boundBoxFunc={(oldBox, newBox) => {
              if (activeComponent?.type === "TEXT") return newBox;
              const stage = stageRef.current;
              const sx = stage?.scaleX() ?? 1;
              const sy = stage?.scaleY() ?? 1;
              const minSize = 30;
              if (newBox.width / sx < minSize || newBox.height / sy < minSize) {
                return oldBox;
              }
              return newBox;
            }}
            onTransformEnd={() => {
              const stage = stageRef.current;
              if (!stage || !activeId) return;
              const node = stage.findOne(`#node-${activeId}`) as Konva.Node | null;
              if (!node) return;
              const c = components.find((x) => x.id === activeId);
              if (!c) return;

              const nextRot = node.rotation();
              if (c.type === "TEXT") {
                update(activeId, {
                  x: node.x() - c.width / 2,
                  y: node.y() - c.height / 2,
                  rotation: nextRot,
                });
                return;
              }

              const sx = node.scaleX();
              const sy = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              const nextW = Math.max(1, c.width * sx);
              const nextH = Math.max(1, c.height * sy);
              update(activeId, {
                x: node.x() - nextW / 2,
                y: node.y() - nextH / 2,
                rotation: nextRot,
                width: nextW,
                height: nextH,
              });
            }}
          />
        </Layer>
      </Stage>
      ) : null}
      </div>
      <p
        id="decorate-canvas-help"
        className="text-center text-[11px] leading-[1.6] text-[color:var(--hc-muted)]"
      >
        캔버스를 누르거나 Tab 으로 옮겨 온 뒤 <b>[</b> <b>]</b> 로 스티커를 고르고,
        화살표로 옮겨요(Shift 를 누르면 크게). <b>Delete</b> 로 지우고 <b>Esc</b> 로 선택을 풀어요.
      </p>
    </div>
  );
}
