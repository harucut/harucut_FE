"use client";

import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

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
  const {
    components,
    activeId,
    setActive,
    remove,
    duplicate,
    moveLayerUp,
    moveLayerDown,
    toggleHidden,
    toggleLocked,
  } = useThemeEditorStore(
    useShallow((s) => ({
      components: s.components,
      activeId: s.activeId,
      setActive: s.setActive,
      remove: s.remove,
      duplicate: s.duplicate,
      moveLayerUp: s.moveLayerUp,
      moveLayerDown: s.moveLayerDown,
      toggleHidden: s.toggleHidden,
      toggleLocked: s.toggleLocked,
    })),
  );

  const list = components;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">레이어</p>
        <p className="text-[11px] text-zinc-500">클릭해서 선택</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-400">
          아직 추가한 요소가 없어요.
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto custom-scroll">
          {list.map((c, idx) => (
            <LayerRow
              key={c.id}
              c={c}
              active={c.id === activeId}
              isFirst={idx === 0}
              isLast={idx === list.length - 1}
              onSelect={() => setActive(c.id)}
              onDelete={() => remove(c.id)}
              onDup={() => duplicate(c.id)}
              onUp={() => moveLayerUp(c.id)}
              onDown={() => moveLayerDown(c.id)}
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
  isFirst,
  isLast,
  onSelect,
  onDelete,
  onDup,
  onUp,
  onDown,
  onToggleHidden,
  onToggleLocked,
}: {
  c: EditorComponent;
  active: boolean;
  isFirst: boolean;
  isLast: boolean;
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

  // 레이어 제어 액션 목록
  const actions: {
    key: string;
    title: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
  }[] = [
    {
      key: "lock",
      title: c.locked ? "잠금 해제" : "잠금",
      icon: c.locked ? <Lock size={14} /> : <LockOpen size={14} />,
      onClick: onToggleLocked,
      active: c.locked,
    },
    {
      key: "hide",
      title: c.hidden ? "숨김 해제" : "숨김",
      icon: c.hidden ? <EyeOff size={14} /> : <Eye size={14} />,
      onClick: onToggleHidden,
      active: c.hidden,
    },
    {
      key: "up",
      title: "위로",
      icon: <ChevronUp size={14} />,
      onClick: onUp,
      disabled: isLast,
    },
    {
      key: "down",
      title: "아래로",
      icon: <ChevronDown size={14} />,
      onClick: onDown,
      disabled: isFirst,
    },
    {
      key: "dup",
      title: "복제",
      icon: <Copy size={14} />,
      onClick: onDup,
    },
    {
      key: "delete",
      title: "삭제",
      icon: <Trash2 size={14} />,
      onClick: onDelete,
      danger: true,
    },
  ];

  return (
    <div
      className={[
        "rounded-xl border p-2 flex items-center gap-2",
        active
          ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)] shadow-[0_14px_32px_var(--hc-shadow)]"
          : "border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)]",
        c.hidden ? "opacity-60" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-2 flex-1 min-w-0"
      >
        <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200">
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
          <div className="h-8 w-8 rounded-lg border border-zinc-800 bg-black/30 flex items-center justify-center text-[11px] text-zinc-300">
            T
          </div>
        )}

        <div className="min-w-0">
          <p className="text-xs text-zinc-200 truncate">{title}</p>
          <p className="text-[11px] text-zinc-500">zIndex {c.zIndex}</p>
        </div>
      </button>

      <div className="flex items-center gap-1">
        {actions.map(({ key, ...action }) => (
          <MiniIconBtn key={key} {...action} />
        ))}
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
  disabled,
}: {
  onClick: () => void;
  icon: ReactNode;
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={[
        "rounded-lg border p-2 inline-flex items-center justify-center",
        danger
          ? "border-[color:var(--hc-danger-border)] bg-[color:var(--hc-danger-soft-bg)] text-[color:var(--hc-danger)] hover:brightness-110"
          : active
          ? "border-[color:var(--hc-accent-soft-border)] bg-[color:var(--hc-accent-soft-bg)] text-[color:var(--hc-primary-strong)] hover:bg-[color:var(--hc-accent-soft-bg)]"
          : "border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] text-[color:var(--hc-muted)] hover:bg-[color:var(--hc-background-tint)]",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}
