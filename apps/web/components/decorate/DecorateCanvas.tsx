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

import { useDecorateStore } from "@/lib/decorateStore";
import { EditableNode } from "@/components/theme/editor/canvas/EditableNode";

const VIEW_MAX_W = 340;
const VIEW_MAX_H = 460;

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

  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [draftPoints, setDraftPoints] = useState<number[]>([]);
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

  const { viewW, viewH, scale } = useMemo(() => {
    if (!base) return { viewW: VIEW_MAX_W, viewH: VIEW_MAX_W, scale: 1 };
    const s = Math.min(VIEW_MAX_W / base.width, VIEW_MAX_H / base.height);
    return {
      viewW: Math.round(base.width * s),
      viewH: Math.round(base.height * s),
      scale: s,
    };
  }, [base]);

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
    const node = stage.findOne(`#node-${activeId}`);
    if (!node) return;
    tr.nodes([node]);
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
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

  const startDraw = () => {
    const p = pointerToBase();
    if (!p) return;
    isDrawingRef.current = true;
    setDraftPoints([p[0], p[1]]);
  };
  const moveDraw = () => {
    if (!isDrawingRef.current) return;
    const p = pointerToBase();
    if (!p) return;
    setDraftPoints((prev) => [...prev, p[0], p[1]]);
  };
  const endDraw = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (draftPoints.length >= 4) addStroke(draftPoints);
    setDraftPoints([]);
  };

  const deselectIfBase = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage() || e.target.name() === "base") {
      setActive(null);
    }
  };

  return (
    <div className="flex justify-center">
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
          {draftPoints.length >= 2 ? (
            <Line
              points={draftPoints}
              stroke={drawColor}
              strokeWidth={drawWidth}
              lineCap="round"
              lineJoin="round"
              tension={0.3}
            />
          ) : null}
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
    </div>
  );
}
