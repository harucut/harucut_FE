"use client";

import { create } from "zustand";
import type {
  CommonStyleJson,
  StickerComponent,
  TextComponent,
  TextStyleJson,
} from "@/lib/types/themeEditor";

// 이미 완성된 네컷(베이스 이미지) 위에 스티커·텍스트·자유 드로잉을 얹는 에디터 상태.
// 좌표계는 베이스 이미지의 실제 픽셀(width×height)을 그대로 쓴다(캔버스는 스케일만 적용).
export type DecorComponent = StickerComponent | TextComponent;

export type DrawStroke = {
  id: string;
  // [x0,y0,x1,y1,...] — 베이스 이미지 좌표계
  points: number[];
  color: string;
  width: number;
};

export type DecorateMode = "select" | "draw";

const uid = (p = "decor") => `${p}-${crypto.randomUUID()}`;

function normalizeZ(components: DecorComponent[]): DecorComponent[] {
  return components.map((c, i) => ({ ...c, zIndex: i + 1 }));
}

type TextPatch = Partial<
  Omit<TextComponent, "id" | "type" | "zIndex" | "styleJson">
> & {
  styleJson?: Partial<TextStyleJson>;
};
type ImagePatch = Partial<
  Omit<StickerComponent, "id" | "type" | "zIndex" | "styleJson">
> & {
  styleJson?: Partial<CommonStyleJson>;
};
export type DecorUpdatePatch = TextPatch | ImagePatch;

type Base = { src: string; width: number; height: number };

type State = {
  base: Base | null;
  components: DecorComponent[];
  strokes: DrawStroke[];
  activeId: string | null;
  mode: DecorateMode;
  drawColor: string;
  drawWidth: number;
  // Konva 트랜스포머 갱신/이미지 로드 후 리렌더 트리거
  renderKey: number;

  setBase: (base: Base) => void;
  setMode: (mode: DecorateMode) => void;
  setDrawColor: (color: string) => void;
  setDrawWidth: (width: number) => void;

  addSticker: (src: string) => void;
  addText: (opts?: { text?: string }) => void;
  updateComponent: (id: string, patch: DecorUpdatePatch) => void;
  setActive: (id: string | null) => void;
  removeActive: () => void;
  // 방금 지운 요소를 되돌린다(1 단계).
  restoreRemoved: () => void;
  canRestoreRemoved: boolean;
  lastRemoved: DecorComponent | null;
  duplicateActive: () => void;
  moveActive: (dir: "up" | "down") => void;

  addStroke: (points: number[]) => void;
  undoStroke: () => void;
  clearStrokes: () => void;

  bumpRenderKey: () => void;
  reset: () => void;
};

export const useDecorateStore = create<State>((set, get) => ({
  base: null,
  components: [],
  lastRemoved: null,
  canRestoreRemoved: false,
  strokes: [],
  activeId: null,
  mode: "select",
  drawColor: "#1ED760",
  drawWidth: 10,
  renderKey: 0,

  setBase: (base) =>
    set({
      base,
      components: [],
      lastRemoved: null,
      canRestoreRemoved: false,
      strokes: [],
      activeId: null,
      mode: "select",
    }),

  setMode: (mode) => set({ mode, activeId: mode === "draw" ? null : get().activeId }),
  setDrawColor: (drawColor) => set({ drawColor }),
  setDrawWidth: (drawWidth) => set({ drawWidth }),

  addSticker: (src) => {
    const { base } = get();
    if (!base) return;
    const size = Math.round(Math.min(base.width, base.height) * 0.28);
    const id = uid("sticker");
    const sticker: StickerComponent = {
      id,
      type: "STICKER",
      source: src,
      x: base.width / 2 - size / 2,
      y: base.height / 2 - size / 2,
      width: size,
      height: size,
      scale: 1,
      rotation: 0,
      zIndex: 0,
      styleJson: { opacity: 1 },
      locked: false,
      hidden: false,
    };
    set((s) => ({
      components: normalizeZ([...s.components, sticker]),
      activeId: id,
      mode: "select",
    }));
  },

  addText: (opts) => {
    const { base } = get();
    if (!base) return;
    const text = opts?.text?.trim() ? opts.text.trim() : "텍스트";
    const fontSize = Math.max(24, Math.round(base.width * 0.07));
    const width = Math.round(base.width * 0.8);
    const id = uid("text");
    const style: TextStyleJson = {
      fontFamily: "Pretendard",
      fontSize,
      color: "#ffffff",
      textAlign: "center",
      opacity: 1,
    };
    const component: TextComponent = {
      id,
      type: "TEXT",
      source: text,
      x: base.width / 2 - width / 2,
      y: Math.round(base.height * 0.5 - fontSize * 0.6),
      width,
      height: Math.round(fontSize * 1.3),
      scale: 1,
      rotation: 0,
      zIndex: 0,
      styleJson: style,
      locked: false,
      hidden: false,
    };
    set((s) => ({
      components: normalizeZ([...s.components, component]),
      activeId: id,
      mode: "select",
    }));
  },

  updateComponent: (id, patch) => {
    set((s) => ({
      components: s.components.map((c) => {
        if (c.id !== id) return c;
        if (c.type === "TEXT") {
          const p = patch as TextPatch;
          const nextStyle = p.styleJson
            ? { ...c.styleJson, ...p.styleJson }
            : c.styleJson;
          return { ...c, ...p, zIndex: c.zIndex, styleJson: nextStyle };
        }
        const p = patch as ImagePatch;
        const current = (c.styleJson ?? {}) as CommonStyleJson;
        const nextStyle = p.styleJson ? { ...current, ...p.styleJson } : current;
        return { ...c, ...p, zIndex: c.zIndex, styleJson: nextStyle };
      }),
    }));
  },

  setActive: (activeId) => set({ activeId }),

  // 삭제는 되돌릴 수 있어야 한다. 직전 삭제 한 건을 들고 있다가 복구한다.
  removeActive: () => {
    const { activeId } = get();
    if (!activeId) return;
    set((s) => {
      const removed = s.components.find((c) => c.id === activeId) ?? null;
      return {
        components: normalizeZ(s.components.filter((c) => c.id !== activeId)),
        activeId: null,
        lastRemoved: removed,
        canRestoreRemoved: Boolean(removed),
      };
    });
  },

  restoreRemoved: () => {
    const removed = get().lastRemoved;
    if (!removed) return;
    set((s) => ({
      components: normalizeZ([...s.components, removed]),
      activeId: removed.id,
      lastRemoved: null,
      canRestoreRemoved: false,
    }));
  },

  duplicateActive: () => {
    const { activeId, components } = get();
    const src = components.find((c) => c.id === activeId);
    if (!src) return;
    const copy = { ...src, id: uid("dup"), x: src.x + 40, y: src.y + 40, zIndex: 0 };
    set((s) => ({
      components: normalizeZ([...s.components, copy]),
      activeId: copy.id,
    }));
  },

  moveActive: (dir) => {
    const { activeId } = get();
    if (!activeId) return;
    set((s) => {
      const idx = s.components.findIndex((c) => c.id === activeId);
      if (idx < 0) return s;
      const target = dir === "up" ? idx + 1 : idx - 1;
      if (target < 0 || target >= s.components.length) return s;
      const next = [...s.components];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { components: normalizeZ(next) };
    });
  },

  addStroke: (points) => {
    if (points.length < 2) return;
    const { drawColor, drawWidth } = get();
    set((s) => ({
      strokes: [
        ...s.strokes,
        { id: uid("stroke"), points, color: drawColor, width: drawWidth },
      ],
    }));
  },

  undoStroke: () =>
    set((s) => ({ strokes: s.strokes.slice(0, Math.max(0, s.strokes.length - 1)) })),

  clearStrokes: () => set({ strokes: [] }),

  bumpRenderKey: () => set((s) => ({ renderKey: s.renderKey + 1 })),

  reset: () =>
    set({
      base: null,
      components: [],
      strokes: [],
      activeId: null,
      mode: "select",
    }),
}));
