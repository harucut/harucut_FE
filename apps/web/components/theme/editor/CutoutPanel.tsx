"use client";

import { useEffect } from "react";
import { Scissors } from "lucide-react";
import { useThemeEditorStore } from "@/lib/themeEditorStore";

// 누끼(셀별 배경 제거) 패널.
// 핸드오프 app-decorate "누끼" 탭과 동일한 개념: 칸을 선택하면 인물만 남기고
// 배경을 지운 듯한 비네트 마스크를 적용한다(MVP 시각 효과). 다시 누르면 해제.
export function CutoutPanel() {
  const cellCutouts = useThemeEditorStore((s) => s.cellCutouts);
  const toggleCellCutout = useThemeEditorStore((s) => s.toggleCellCutout);
  const cutMode = useThemeEditorStore((s) => s.cutMode);
  const setCutMode = useThemeEditorStore((s) => s.setCutMode);

  // 캔버스 칸 탭 모드는 켜져 있는 동안 칸 히트 영역이 모든 클릭/드래그를 가로채
  // 컴포넌트를 선택·이동할 수 없게 만든다. 따라서 기본은 꺼둔 채 아래 토글로만
  // 명시적으로 켜고, 누끼 탭을 벗어나면(언마운트) 항상 다시 끈다.
  useEffect(() => {
    return () => setCutMode(false);
  }, [setCutMode]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">누끼</p>
        <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--hc-primary)]">
          <Scissors size={13} /> 배경 제거
        </span>
      </div>

      <p className="text-[11px] leading-5 text-zinc-400">
        아래 버튼으로 칸을 골라 인물만 남기고 배경을 지워요. 다시 누르면 원래대로
        돌아와요. 미리보기에서 칸을 직접 눌러 토글하려면 ‘캔버스 칸 탭’을 켜세요.
      </p>

      <button
        type="button"
        onClick={() => setCutMode(!cutMode)}
        className={[
          "flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition",
          cutMode
            ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)] text-[color:var(--hc-primary)]"
            : "border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] text-[color:var(--hc-muted)]",
        ].join(" ")}
        aria-pressed={cutMode}
      >
        <span>캔버스 칸 탭으로 누끼</span>
        <span className="text-[10px]">{cutMode ? "켬" : "끔"}</span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => {
          const on = cellCutouts[i];
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggleCellCutout(i)}
              className={[
                "flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition",
                on
                  ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)] text-[color:var(--hc-primary)]"
                  : "border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] text-[color:var(--hc-muted)]",
              ].join(" ")}
              aria-pressed={on}
            >
              <span>{i + 1}번 칸</span>
              <span className="text-[10px]">{on ? "적용됨" : "끔"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
