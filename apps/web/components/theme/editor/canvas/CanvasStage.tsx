"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Group,
  Transformer,
  Image as KonvaImage,
} from "react-konva";
import Konva from "konva";

import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import { EditableNode } from "./EditableNode";

const VIEW_SIZE = 330;

export function CanvasStage() {
  const frameId = useThemeEditorStore((s) => s.frameId);
  const components = useThemeEditorStore((s) => s.components);
  const activeId = useThemeEditorStore((s) => s.activeId);
  const backgroundColor = useThemeEditorStore((s) => s.backgroundColor);
  const background = useThemeEditorStore((s) => s.background);
  const renderKey = useThemeEditorStore((s) => s.renderKey);
  const cellCutouts = useThemeEditorStore((s) => s.cellCutouts);
  const toggleCellCutout = useThemeEditorStore((s) => s.toggleCellCutout);
  const cutMode = useThemeEditorStore((s) => s.cutMode);

  const backgroundImageUrl =
    background.type === "IMAGE" ? background.url : undefined;
  const [backgroundImage, setBackgroundImage] =
    useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!backgroundImageUrl) {
      setBackgroundImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    let active = true;
    img.onload = () => {
      if (active) setBackgroundImage(img);
    };
    img.onerror = () => {
      if (active) setBackgroundImage(null);
    };
    img.src = backgroundImageUrl;
    return () => {
      active = false;
    };
  }, [backgroundImageUrl]);

  const setActive = useThemeEditorStore((s) => s.setActive);
  const update = useThemeEditorStore((s) => s.updateComponent);
  const bumpRenderKey = useThemeEditorStore((s) => s.bumpRenderKey);

  const layout = frameId ? FRAME_LAYOUTS[frameId] : null;

  const stageRef = useRef<Konva.Stage | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);

  const activeComponent = useMemo(
    () => components.find((x) => x.id === activeId) ?? null,
    [components, activeId],
  );

  // 고정 뷰 크기에 맞춰 캔버스 스케일 계산
  const { viewW, viewH, scale } = useMemo(() => {
    if (!layout) return { viewW: VIEW_SIZE, viewH: VIEW_SIZE, scale: 1 };

    const s = Math.min(
      VIEW_SIZE / layout.totalWidth,
      VIEW_SIZE / layout.totalHeight,
    );

    return {
      viewW: Math.round(layout.totalWidth * s),
      viewH: Math.round(layout.totalHeight * s),
      scale: s,
    };
  }, [layout]);

  // 선택된 노드를 Konva Transformer에 연결
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;

    if (!activeId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }

    const node = stage.findOne(`#node-${activeId}`);
    if (!node) return;

    tr.nodes([node]);
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  }, [activeId, renderKey]);

  // zIndex 기준으로 렌더 순서 보장
  const sorted = useMemo(
    () => [...components].sort((a, b) => a.zIndex - b.zIndex),
    [components],
  );

  if (!layout) return null;

  const frameW = layout.totalWidth;
  const frameH = layout.totalHeight;

  return (
    <div className="w-[330px]">
      <div className="flex justify-center">
        <Stage
          ref={stageRef}
          width={viewW}
          height={viewH}
          scaleX={scale}
          scaleY={scale}
          className="block bg-transparent"
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) setActive(null);
          }}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage()) setActive(null);
          }}
        >
          {/* 1) 아래: 프레임 배경 + 슬롯(구멍 느낌) */}
          {/* 1) 아래: 프레임 배경 + 슬롯(구멍 느낌) */}
          <Layer listening={false}>
            <Rect
              x={0}
              y={0}
              width={frameW}
              height={frameH}
              fill={`#${backgroundColor}`}
              cornerRadius={60}
            />

            {backgroundImage
              ? (() => {
                  const iw =
                    backgroundImage.naturalWidth || backgroundImage.width || 1;
                  const ih =
                    backgroundImage.naturalHeight || backgroundImage.height || 1;
                  const fr = frameW / frameH;
                  const ir = iw / ih;
                  let cw = iw;
                  let ch = ih;
                  let cx = 0;
                  let cy = 0;
                  // cover crop
                  if (ir > fr) {
                    ch = ih;
                    cw = ih * fr;
                    cx = (iw - cw) / 2;
                  } else {
                    cw = iw;
                    ch = iw / fr;
                    cy = (ih - ch) / 2;
                  }
                  return (
                    <KonvaImage
                      image={backgroundImage}
                      x={0}
                      y={0}
                      width={frameW}
                      height={frameH}
                      crop={{ x: cx, y: cy, width: cw, height: ch }}
                      cornerRadius={60}
                      opacity={
                        background.type === "IMAGE"
                          ? background.opacity ?? 1
                          : 1
                      }
                    />
                  );
                })()
              : null}

            {layout.slots.map((s, i) => (
              <Rect
                key={i}
                x={s.x}
                y={s.y}
                width={s.width}
                height={s.height}
                cornerRadius={40}
                fill="rgba(0,0,0,0.30)"
              />
            ))}
          </Layer>

          {/* 2) 가운데: 오브젝트들 (사진/스티커/텍스트) */}
          <Layer>
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
                // 텍스트 회전 허용
                if (activeComponent?.type === "TEXT") return newBox;
                const stage = stageRef.current;
                const scaleX = stage?.scaleX() ?? 1;
                const scaleY = stage?.scaleY() ?? 1;
                const minSize = 40;
                const logicalW = newBox.width / scaleX;
                const logicalH = newBox.height / scaleY;

                // 스테이지 크기가 축소되더라도 스테이지 좌표계에서 최소 크기 검사를 유지
                if (logicalW < minSize || logicalH < minSize) return oldBox;
                return newBox;
              }}
              onTransformEnd={() => {
                const stage = stageRef.current;
                if (!stage || !activeId) return;

                const node = stage.findOne(
                  `#node-${activeId}`,
                ) as Konva.Node | null;
                if (!node) return;

                const c = components.find((x) => x.id === activeId);
                if (!c) return;

                const nextRot = node.rotation();

                if (c.type === "TEXT") {
                  const nextX = node.x() - c.width / 2;
                  const nextY = node.y() - c.height / 2;
                  update(activeId, {
                    x: nextX,
                    y: nextY,
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

                // PHOTO / STICKER
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

          {/* 3) 위: 프레임 오버레이(항상 보이게) */}
          <Layer listening={false}>
            {layout.slots.map((s, i) => (
              <Rect
                key={i}
                x={s.x}
                y={s.y}
                width={s.width}
                height={s.height}
                cornerRadius={40}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={6}
              />
            ))}
          </Layer>

          {/* 4) 누끼(셀별 배경 제거) 오버레이 + 탭 토글 */}
          <Layer listening={cutMode}>
            {layout.slots.slice(0, 4).map((s, i) => {
              const on = cellCutouts[i];
              const cx = s.x + s.width / 2;
              const cy = s.y + s.height / 2;
              const radius = Math.min(s.width, s.height) * 0.62;
              return (
                <Group key={i}>
                  {on ? (
                    <>
                      {/* 가장자리를 어둡게 해 피사체만 남은 듯한 비네트 마스크(MVP 시각 효과) */}
                      <Rect
                        x={s.x}
                        y={s.y}
                        width={s.width}
                        height={s.height}
                        cornerRadius={40}
                        listening={false}
                        fillRadialGradientStartPoint={{ x: cx - s.x, y: cy - s.y }}
                        fillRadialGradientEndPoint={{ x: cx - s.x, y: cy - s.y }}
                        fillRadialGradientStartRadius={radius * 0.6}
                        fillRadialGradientEndRadius={radius}
                        fillRadialGradientColorStops={[
                          0,
                          "rgba(0,0,0,0)",
                          1,
                          "rgba(11,11,12,0.82)",
                        ]}
                      />
                      <Rect
                        x={s.x}
                        y={s.y}
                        width={s.width}
                        height={s.height}
                        cornerRadius={40}
                        listening={false}
                        stroke="#1ED760"
                        strokeWidth={10}
                      />
                    </>
                  ) : null}
                  {/* 셀 탭으로 누끼 토글 */}
                  <Rect
                    x={s.x}
                    y={s.y}
                    width={s.width}
                    height={s.height}
                    cornerRadius={40}
                    fill="rgba(0,0,0,0.001)"
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                      toggleCellCutout(i);
                    }}
                    onTouchStart={(e) => {
                      e.cancelBubble = true;
                      toggleCellCutout(i);
                    }}
                  />
                </Group>
              );
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
