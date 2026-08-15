"use client";

import { STICKERS } from "@/constants/stickers.generated";
import { useDecorateStore } from "@/lib/decorateStore";
import type { TextStyleJson } from "@/lib/types/themeEditor";

const DRAW_COLORS = [
  "#1ED760",
  "#ffffff",
  "#0b0b0c",
  "#ff5d5d",
  "#ffd23f",
  "#4d7cff",
  "#ff8ad4",
];
// 굵기 값과 사람이 부르는 이름을 한 쌍으로 둔다. 버튼 안이 점 하나뿐이라
// 이름이 없으면 스크린리더에 "버튼"으로만 읽힌다.
const DRAW_WIDTHS = [
  { value: 6, label: "가늘게" },
  { value: 10, label: "보통" },
  { value: 18, label: "굵게" },
  { value: 28, label: "아주 굵게" },
] as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-xs font-semibold text-zinc-200">{title}</h3>
      {children}
    </section>
  );
}

export function DecoratePanel() {
  const mode = useDecorateStore((s) => s.mode);
  const setMode = useDecorateStore((s) => s.setMode);
  const addSticker = useDecorateStore((s) => s.addSticker);
  const addText = useDecorateStore((s) => s.addText);
  const drawColor = useDecorateStore((s) => s.drawColor);
  const setDrawColor = useDecorateStore((s) => s.setDrawColor);
  const drawWidth = useDecorateStore((s) => s.drawWidth);
  const setDrawWidth = useDecorateStore((s) => s.setDrawWidth);
  const undoStroke = useDecorateStore((s) => s.undoStroke);
  const clearStrokes = useDecorateStore((s) => s.clearStrokes);
  const strokeCount = useDecorateStore((s) => s.strokes.length);
  const components = useDecorateStore((s) => s.components);
  const activeId = useDecorateStore((s) => s.activeId);
  const update = useDecorateStore((s) => s.updateComponent);
  const removeActive = useDecorateStore((s) => s.removeActive);
  const duplicateActive = useDecorateStore((s) => s.duplicateActive);
  const moveActive = useDecorateStore((s) => s.moveActive);

  const active = components.find((c) => c.id === activeId) ?? null;
  const activeOpacity =
    (active?.styleJson as { opacity?: number } | undefined)?.opacity ?? 1;
  const activeTextStyle =
    active?.type === "TEXT" ? (active.styleJson as TextStyleJson) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* 그리기 모드 토글 */}
      <Section title="그리기">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode(mode === "draw" ? "select" : "draw")}
            className={`flex-1 rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
              mode === "draw"
                ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)] text-[color:var(--hc-primary-strong)]"
                : "border-zinc-700 text-zinc-300"
            }`}
          >
            {mode === "draw" ? "그리는 중 · 끄기" : "펜으로 그리기"}
          </button>
          <button
            type="button"
            onClick={undoStroke}
            disabled={strokeCount === 0}
            className="rounded-full border border-zinc-700 px-3 py-2 text-[11px] text-zinc-300 disabled:opacity-40"
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={clearStrokes}
            disabled={strokeCount === 0}
            className="rounded-full border border-zinc-700 px-3 py-2 text-[11px] text-zinc-300 disabled:opacity-40"
          >
            지우기
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DRAW_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setDrawColor(color)}
              className={`h-6 w-6 rounded-full border ${
                drawColor === color
                  ? "border-[color:var(--hc-primary)] ring-2 ring-[color:var(--hc-primary)]"
                  : "border-black/20"
              }`}
              style={{ backgroundColor: color }}
              aria-label={`색상 ${color}`}
            />
          ))}
          <input
            type="color"
            value={drawColor}
            onChange={(e) => setDrawColor(e.target.value)}
            className="h-6 w-8 rounded border border-zinc-700 bg-transparent"
            aria-label="펜 색상 직접 선택"
          />
        </div>
        <div className="flex items-center gap-2">
          {DRAW_WIDTHS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setDrawWidth(value)}
              aria-label={`펜 굵기 ${label}`}
              aria-pressed={drawWidth === value}
              className={`flex h-8 flex-1 items-center justify-center rounded-lg border ${
                drawWidth === value
                  ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)]"
                  : "border-zinc-700"
              }`}
            >
              <span
                aria-hidden
                className="rounded-full bg-zinc-200"
                style={{ width: value, height: value }}
              />
            </button>
          ))}
        </div>
      </Section>

      {/* 텍스트 */}
      <Section title="텍스트">
        <button
          type="button"
          onClick={() => addText()}
          className="hc-button-secondary rounded-full border px-3 py-2 text-[11px] font-semibold"
        >
          텍스트 추가
        </button>
        {activeTextStyle && active ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={active.source}
              onChange={(e) => update(active.id, { source: e.target.value })}
              rows={2}
              className="hc-input w-full resize-none rounded-lg border px-3 py-2 text-[12px]"
              placeholder="내용을 입력하세요"
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400">색상</span>
              <input
                type="color"
                value={activeTextStyle.color}
                onChange={(e) =>
                  update(active.id, { styleJson: { color: e.target.value } })
                }
                className="h-7 w-10 rounded border border-zinc-700 bg-transparent"
              />
              <span className="ml-2 text-[11px] text-zinc-400">정렬</span>
              {(["left", "center", "right"] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => update(active.id, { styleJson: { textAlign: align } })}
                  className={`rounded-md border px-2 py-1 text-[10px] ${
                    activeTextStyle.textAlign === align
                      ? "border-[color:var(--hc-primary)] text-[color:var(--hc-primary-strong)]"
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  {align === "left" ? "왼쪽" : align === "center" ? "가운데" : "오른쪽"}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      {/* 스티커 */}
      <Section title="스티커">
        <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto">
          {STICKERS.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              onClick={() => addSticker(sticker.src)}
              className="aspect-square rounded-lg border border-zinc-800 bg-zinc-950/60 p-1 transition hover:border-zinc-600"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sticker.src}
                alt={sticker.name ?? "스티커"}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      </Section>

      {/* 선택한 요소 편집 */}
      {active ? (
        <Section title="선택한 요소">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[11px] text-zinc-300">
              투명도
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={activeOpacity}
                onChange={(e) =>
                  update(active.id, {
                    styleJson: { opacity: Number(e.target.value) },
                  })
                }
                className="flex-1"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => moveActive("up")}
                className="rounded-full border border-zinc-700 px-3 py-1.5 text-[11px] text-zinc-300"
              >
                앞으로
              </button>
              <button
                type="button"
                onClick={() => moveActive("down")}
                className="rounded-full border border-zinc-700 px-3 py-1.5 text-[11px] text-zinc-300"
              >
                뒤로
              </button>
              <button
                type="button"
                onClick={duplicateActive}
                className="rounded-full border border-zinc-700 px-3 py-1.5 text-[11px] text-zinc-300"
              >
                복제
              </button>
              <button
                type="button"
                onClick={removeActive}
                className="rounded-full border border-[color:var(--hc-danger-border)] px-3 py-1.5 text-[11px] text-[color:var(--hc-danger)]"
              >
                삭제
              </button>
            </div>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
