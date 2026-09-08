"use client";

import { useMemo } from "react";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import type { EditorComponent, TextStyleJson } from "@/lib/types/themeEditor";

type OpacityStyle = { opacity?: number };

// styleJson에서 opacity를 안전하게 읽기
function getOpacity(styleJson: EditorComponent["styleJson"]): number {
  const opacity = (styleJson as OpacityStyle | undefined)?.opacity;
  return Number.isFinite(opacity as number) ? (opacity as number) : 1;
}

// styleJson의 나머지 속성은 두고 opacity 만 갱신
function setOpacity(
  c: EditorComponent,
  opacity: number,
): EditorComponent["styleJson"] {
  const base = (c.styleJson ?? {}) as OpacityStyle;
  return { ...base, opacity };
}

export function InspectorPanel() {
  const components = useThemeEditorStore((s) => s.components);
  const activeId = useThemeEditorStore((s) => s.activeId);
  const update = useThemeEditorStore((s) => s.updateComponent);

  // 현재 선택된 컴포넌트
  const active = useMemo(
    () => components.find((c) => c.id === activeId) ?? null,
    [components, activeId],
  );

  if (!active) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-sm font-semibold">속성</p>
        <p className="mt-2 text-[12px] text-zinc-400">
          캔버스에서 요소를 선택하세요.
        </p>
      </section>
    );
  }

  const opacity = getOpacity(active.styleJson);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">속성</p>
        <span className="text-[11px] text-(--hc-muted)">{active.type}</span>
      </div>

      {/* 공통 */}
      <Row label="불투명도">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={opacity}
          onChange={(e) => {
            const next = Number(e.target.value);
            update(active.id, { styleJson: setOpacity(active, next) });
          }}
          className="w-full"
        />
        <span className="w-10 text-right text-[11px] text-zinc-300">
          {Math.round(opacity * 100)}%
        </span>
      </Row>

      <Row label="회전">
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={active.rotation ?? 0}
          onChange={(e) =>
            update(active.id, { rotation: Number(e.target.value) })
          }
          className="w-full"
        />
        <span className="w-10 text-right text-[11px] text-zinc-300">
          {Math.round(active.rotation ?? 0)}°
        </span>
      </Row>

      {active.type === "TEXT" && (
        <TextInspector
          c={active}
          onChange={(patch) => update(active.id, patch)}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <SmallStat label="x" value={Math.round(active.x)} />
        <SmallStat label="y" value={Math.round(active.y)} />
        <SmallStat label="w" value={Math.round(active.width)} />
        <SmallStat label="h" value={Math.round(active.height)} />
      </div>
    </section>
  );
}

function TextInspector({
  c,
  onChange,
}: {
  c: EditorComponent;
  onChange: (patch: Partial<EditorComponent>) => void;
}) {
  const style = (c.styleJson ?? {}) as TextStyleJson;

  // 서버는 컴포넌트 source 를 빈 값으로 받지 않는다(minLength 1). 그래서 글자를 지운
  // 레이어는 저장 요청에서 빠진다(lib/frameApi.ts). 지우는 것 자체를 막으면 고쳐 쓰지도
  // 못하므로, 막는 대신 사라질 것을 미리 알린다.
  const isBlank = !c.source.trim();
  const blankHintId = `text-source-hint-${c.id}`;

  return (
    <div className="flex flex-col gap-3">
      {/*
        경고는 Row(=<label>) **밖**에 둔다. 안에 넣으면 라벨 텍스트로 딸려 들어가
        입력칸 이름이 "텍스트 글자가 비어 있어요…" 가 되고, aria-describedby 로 한 번 더
        읽혀 같은 문장을 두 번 듣는다. 이름은 "텍스트", 설명은 경고 하나로 나눈다.
        들여쓰기(4.25rem)는 Row 의 라벨 칸(w-14) + gap-3 만큼이라 입력칸에 줄이 맞는다.
      */}
      <div className="flex flex-col gap-1">
        <Row label="텍스트">
          <input
            value={c.source}
            onChange={(e) => onChange({ source: e.target.value })}
            aria-describedby={isBlank ? blankHintId : undefined}
            className="w-full rounded-lg border border-(--hc-border) bg-(--hc-surface-strong) px-3 py-2 text-xs text-(--hc-text)"
          />
        </Row>
        {isBlank ? (
          <p id={blankHintId} className="pl-[4.25rem] text-[11px] text-amber-300">
            글자가 비어 있어요. 이 레이어는 저장되지 않아요.
          </p>
        ) : null}
      </div>

      <Row label="폰트">
        <input
          value={style.fontFamily ?? "Pretendard"}
          onChange={(e) =>
            onChange({
              styleJson: { ...style, fontFamily: e.target.value },
            })
          }
          className="w-full rounded-lg border border-(--hc-border) bg-(--hc-surface-strong) px-3 py-2 text-xs text-(--hc-text)"
        />
      </Row>

      <Row label="크기">
        <input
          type="range"
          min={12}
          max={420}
          step={1}
          value={style.fontSize ?? 48}
          onChange={(e) =>
            onChange({
              styleJson: { ...style, fontSize: Number(e.target.value) },
            })
          }
          className="w-full"
        />
        <span className="w-10 text-right text-[11px] text-zinc-300">
          {style.fontSize ?? 48}
        </span>
      </Row>

      <Row label="색">
        <input
          type="color"
          value={style.color ?? "#ffffff"}
          onChange={(e) =>
            onChange({
              styleJson: { ...style, color: e.target.value },
            })
          }
          className="h-9 w-12 rounded-lg border border-(--hc-border) bg-(--hc-surface-strong)"
        />
        <select
          value={style.textAlign ?? "center"}
          onChange={(e) => {
            const v = e.target.value;
            const align: TextStyleJson["textAlign"] =
              v === "left" || v === "center" || v === "right" ? v : "center";
            onChange({ styleJson: { ...style, textAlign: align } });
          }}
          className="flex-1 rounded-lg border border-(--hc-border) bg-(--hc-surface-strong) px-3 py-2 text-xs text-(--hc-text)"
        >
          <option value="left">왼쪽</option>
          <option value="center">가운데</option>
          <option value="right">오른쪽</option>
        </select>
      </Row>
    </div>
  );
}

// 라벨을 <label> 로 감싸 컨트롤과 연결한다. span 으로 두면 스크린리더가 슬라이더를
// 이름 없이 "슬라이더"로만 읽는다 — 이 패널의 컨트롤 전부가 그랬다.
// 각 Row 에는 폼 컨트롤이 하나씩만 들어간다(옆의 값 표시는 컨트롤이 아니다).
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-14 text-[12px] text-zinc-400">{label}</span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
    </label>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-(--hc-border) bg-(--hc-surface-strong) px-3 py-2">
      <p className="text-[11px] text-(--hc-muted)">{label}</p>
      <p className="font-mono text-xs tabular-nums text-zinc-200">{value}</p>
    </div>
  );
}
