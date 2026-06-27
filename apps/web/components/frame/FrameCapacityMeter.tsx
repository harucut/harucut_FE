"use client";

import { Lock, Sparkles } from "lucide-react";
import { buildGaugeDots, type GaugeDotState, type PlanInfo } from "@/constants/planLimits";

type FrameCapacityMeterProps = {
  plan: PlanInfo;
  used: number;
  /** 업그레이드 CTA 클릭 시 호출(미제공 시 버튼 숨김) */
  onUpgrade?: () => void;
};

/**
 * 요금제별 프레임 보관 한도를 보여주는 슬롯 게이지(capacity meter).
 * 저장 개수(used)는 listMyFrames 실데이터, 한도(limit)는 요금제 tier에서 구동한다.
 */
export function FrameCapacityMeter({ plan, used, onUpgrade }: FrameCapacityMeterProps) {
  const { name, limit, next, nextLimit } = plan;
  const unlimited = !Number.isFinite(limit);
  const full = !unlimited && used >= limit;
  const remaining = Math.max(0, limit - used);
  const dots = buildGaugeDots(used, limit);

  return (
    <section className="rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[color:var(--hc-accent-soft-bg)] px-3 text-[12px] font-extrabold text-[color:var(--hc-accent-soft-text)]">
            <Sparkles className="h-3.5 w-3.5" />
            {name}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-[color:var(--hc-text)] lg:text-base">
              보관 {used}{" "}
              <span className="font-semibold text-[color:var(--hc-muted-soft)]">
                / {unlimited ? "무제한" : `${limit}개`}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-[color:var(--hc-muted)]">
              {unlimited
                ? "무제한으로 저장할 수 있어요"
                : full
                  ? "보관함이 가득 찼어요"
                  : `${remaining}개 더 저장할 수 있어요`}
            </p>
          </div>
        </div>

        {onUpgrade && next && !unlimited ? (
          <button
            type="button"
            onClick={onUpgrade}
            className="hc-accent-chip whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          >
            {next}로 업그레이드 · {nextLimit}개
          </button>
        ) : null}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
        {dots.map((state, i) => (
          <GaugeDot key={i} state={state} />
        ))}
        {unlimited ? null : (
          <span className="ml-1 text-[11px] text-[color:var(--hc-muted)]">
            {limit}개 이후는 상위 요금제
          </span>
        )}
      </div>
    </section>
  );
}

function GaugeDot({ state }: { state: GaugeDotState }) {
  const className = [
    "inline-grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-[1.5px]",
    state === "filled"
      ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-primary)]"
      : state === "empty"
        ? "border-[color:var(--hc-border-strong)] bg-transparent"
        : "border-[color:var(--hc-border-subtle)] bg-transparent",
  ].join(" ");

  return (
    <span className={className} aria-hidden>
      {state === "locked" ? (
        <Lock className="h-2 w-2 text-[color:var(--hc-muted-soft)]" />
      ) : null}
    </span>
  );
}
