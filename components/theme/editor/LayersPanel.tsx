"use client";

import { useThemeEditorStore } from "@/lib/themeEditorStore";
import type { EditorComponent } from "@/lib/types/themeEditor";
import {
  Lock,
  LockOpen,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
} from "lucide-react";

export function LayersPanel() {
  const components = useThemeEditorStore((s) => s.components);
  const activeId = useThemeEditorStore((s) => s.activeId);

  const setActive = useThemeEditorStore((s) => s.setActive);
  const remove = useThemeEditorStore((s) => s.remove);
  const duplicate = useThemeEditorStore((s) => s.duplicate);

  const up = useThemeEditorStore((s) => s.moveLayerUp);
  const down = useThemeEditorStore((s) => s.moveLayerDown);

  const toggleHidden = useThemeEditorStore((s) => s.toggleHidden);
  const toggleLocked = useThemeEditorStore((s) => s.toggleLocked);

  const list = [...components].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">레이어</p>
        <p className="text-[11px] text-zinc-500">클릭해서 선택</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-400">
          아직 추가된 요소가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto custom-scroll">
          {list.map((c, idx) => (
            <LayerRow
              key={c.id}
              c={c}
              index={idx}
              active={c.id === activeId}
              onSelect={() => setActive(c.id)}
              onDelete={() => remove(c.id)}
              onDup={() => duplicate(c.id)}
              onUp={() => up(c.id)}
              onDown={() => down(c.id)}
              onToggleHidden={() => toggleHidden(c.id)}
              onToggleLocked={() => toggleLocked(c.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LayerRow({
  c,
  active,
  onSelect,
  onDelete,
  onDup,
  onUp,
  onDown,
  onToggleHidden,
  onToggleLocked,
}: {
  c: EditorComponent;
  index: number;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDup: () => void;
  onUp: () => void;
  onDown: () => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
}) {
  const title =
    c.type === "TEXT"
      ? `TEXT: ${c.source.slice(0, 10)}${c.source.length > 10 ? "…" : ""}`
      : c.type;

  return (
    <div
      className={[
        "rounded-xl border p-2 flex items-center gap-2",
        active
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-zinc-800 bg-zinc-950",
        c.hidden ? "opacity-60" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-2 flex-1 min-w-0"
      >
        <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-200">
          {c.type}
        </span>

        {c.type !== "TEXT" ? (
          <div className="h-8 w-8 overflow-hidden rounded-lg border border-zinc-800 bg-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.source}
              alt={c.type}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
        ) : (
          <div className="h-8 w-8 rounded-lg border border-zinc-800 bg-black/30 flex items-center justify-center text-[10px] text-zinc-300">
            T
          </div>
        )}

        <div className="min-w-0">
          <p className="text-xs text-zinc-200 truncate">{title}</p>
          <p className="text-[10px] text-zinc-500">zIndex {c.zIndex}</p>
        </div>
      </button>

      <div className="flex items-center gap-1">
        <MiniIconBtn
          onClick={onToggleLocked}
          title={c.locked ? "잠금 해제" : "잠금"}
          active={c.locked}
          icon={c.locked ? <Lock size={14} /> : <LockOpen size={14} />}
        />
        <MiniIconBtn
          onClick={onToggleHidden}
          title={c.hidden ? "숨김 해제" : "숨김"}
          active={c.hidden}
          icon={c.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        />
        <MiniIconBtn
          onClick={onUp}
          title="위로"
          icon={<ChevronUp size={14} />}
        />
        <MiniIconBtn
          onClick={onDown}
          title="아래로"
          icon={<ChevronDown size={14} />}
        />
        <MiniIconBtn onClick={onDup} title="복제" icon={<Copy size={14} />} />
        <MiniIconBtn
          onClick={onDelete}
          title="삭제"
          danger
          icon={<Trash2 size={14} />}
        />
      </div>
    </div>
  );
}

function MiniIconBtn({
  onClick,
  icon,
  title,
  active,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={[
        "rounded-lg border p-2 inline-flex items-center justify-center",
        danger
          ? "border-red-800/70 bg-red-950 text-red-200 hover:bg-red-900/60"
          : active
            ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
            : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}
