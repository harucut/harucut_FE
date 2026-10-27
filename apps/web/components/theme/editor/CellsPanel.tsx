"use client";

import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { FREE_CELL_COUNT, validateCells, type FreeCell, type FreeCellShape } from "@/lib/frameCells";
import { useThemeEditorStore } from "@/lib/themeEditorStore";

const FIELDS: Array<{ key: "x" | "y" | "width" | "height" | "rotation"; label: string; unit: string }> = [
  { key: "x", label: "가로 위치", unit: "px" },
  { key: "y", label: "세로 위치", unit: "px" },
  { key: "width", label: "너비", unit: "px" },
  { key: "height", label: "높이", unit: "px" },
  { key: "rotation", label: "회전", unit: "도" },
];

/**
 * 사진 칸 자유 편집(P5, R5 6절). 네 칸은 그대로 두고 칸마다 위치·크기·회전·모양과 「몇 번째 사진을 넣을지」를 정한다.
 * 값은 서버 계약과 같은 규칙으로 맞춘다(lib/frameCells.ts). 합성 렌더가 열리기 전에는 이 프레임으로 촬영·게시할 수 없다(FRAME-008).
 */
export function CellsPanel() {
  const frameId = useThemeEditorStore((s) => s.frameId);
  const cells = useThemeEditorStore((s) => s.cells);
  const setFreeCells = useThemeEditorStore((s) => s.setFreeCells);
  const updateCell = useThemeEditorStore((s) => s.updateCell);
  const setCellShot = useThemeEditorStore((s) => s.setCellShot);
  const [open, setOpen] = useState(0);

  if (!frameId) return null;
  const layout = FRAME_LAYOUTS[frameId];
  const violations = cells ? validateCells(cells, { width: layout.totalWidth, height: layout.totalHeight }) : [];

  return (
    <section aria-labelledby="theme-cells-title" className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between">
        <p id="theme-cells-title" className="text-sm font-semibold">
          사진 칸
        </p>
        <span className="inline-flex items-center gap-1 text-[12px] text-(--hc-muted)">
          <LayoutGrid size={13} aria-hidden /> 네 칸
        </span>
      </div>

      <label className="flex min-h-11 items-center justify-between gap-2 text-[13px] font-semibold">
        칸 자유 편집
        <input
          type="checkbox"
          role="switch"
          className="size-5"
          checked={cells !== null}
          onChange={(e) => setFreeCells(e.target.checked)}
        />
      </label>
      <p className="text-[12px] leading-[1.6] text-(--hc-muted)">
        {cells
          ? "칸마다 위치·크기·회전·모양과 넣을 사진 순서를 정해요. 이 프레임은 자유 칸 촬영이 열리면 쓸 수 있어요."
          : "켜면 지금 칸 모양에서 시작해요. 끄면 원래 칸으로 돌아가요."}
      </p>

      {cells ? (
        <>
          <div role="tablist" aria-label="고칠 칸" className="grid grid-cols-4 gap-1">
            {cells.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={open === i}
                onClick={() => setOpen(i)}
                className={`h-11 rounded-xl border text-[13px] font-semibold ${
                  open === i
                    ? "border-(--hc-primary) bg-(--hc-accent-soft-bg) text-(--hc-primary-strong)"
                    : "border-(--hc-border) text-(--hc-muted)"
                }`}
              >
                {i + 1}번 칸
              </button>
            ))}
          </div>
          <CellFields
            index={open}
            cell={cells[open]}
            onChange={(patch) => updateCell(open, patch)}
            onShot={(shot) => setCellShot(open, shot)}
          />
          {violations.length > 0 ? (
            <ul role="alert" className="flex flex-col gap-0.5 text-[12px] text-(--hc-danger)">
              {violations.map((v, i) => (
                <li key={i}>
                  {v.index === null ? "" : `${v.index + 1}번 칸: `}
                  {v.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function CellFields({
  index,
  cell,
  onChange,
  onShot,
}: {
  index: number;
  cell: FreeCell;
  onChange: (patch: Partial<Omit<FreeCell, "shotIndex">>) => void;
  onShot: (shotIndex: number) => void;
}) {
  const id = `theme-cell-${index}`;
  const setShape = (shape: FreeCellShape) => onChange({ shape });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1 text-[12px] font-semibold">
            {field.label}({field.unit})
            <input
              type="number"
              inputMode="decimal"
              step={field.key === "rotation" ? 0.5 : 1}
              value={cell[field.key]}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (e.target.value.trim() !== "" && Number.isFinite(value)) onChange({ [field.key]: value });
              }}
              className="hc-input h-11 rounded-xl border px-3 text-[14px] font-normal"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-[12px] font-semibold">
          넣을 사진
          <select
            value={cell.shotIndex}
            onChange={(e) => onShot(Number(e.target.value))}
            className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
          >
            {Array.from({ length: FREE_CELL_COUNT }, (_, shot) => (
              <option key={shot} value={shot}>
                {shot + 1}번째 사진
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[12px] font-semibold">모양</legend>
        <div className="flex gap-4">
          <label className="flex min-h-11 items-center gap-2 text-[13px]">
            <input
              type="radio"
              name={`${id}-shape`}
              className="size-4"
              checked={cell.shape.type === "RECT"}
              onChange={() => setShape({ type: "RECT", cornerRadius: 0 })}
            />
            사각형
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[13px]">
            <input
              type="radio"
              name={`${id}-shape`}
              className="size-4"
              checked={cell.shape.type === "ELLIPSE"}
              onChange={() => setShape({ type: "ELLIPSE" })}
            />
            타원
          </label>
        </div>
        {cell.shape.type === "RECT" ? (
          <label className="flex flex-col gap-1 text-[12px] font-semibold">
            모서리 둥글기(px)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={cell.shape.cornerRadius}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (e.target.value.trim() !== "" && Number.isFinite(value)) setShape({ type: "RECT", cornerRadius: value });
              }}
              className="hc-input h-11 w-32 rounded-xl border px-3 text-[14px] font-normal"
            />
          </label>
        ) : null}
      </fieldset>
    </div>
  );
}
