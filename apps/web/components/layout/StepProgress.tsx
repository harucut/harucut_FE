"use client";

type StepProgressProps = {
  current: number;
  total: number;
  label: string;
};

export function StepProgress({ current, total, label }: StepProgressProps) {
  return (
    <section className="hc-surface-soft rounded-2xl border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-[color:var(--hc-text)]">{label}</p>
        <span className="text-[10px] text-zinc-500">
          {current}/{total}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        {Array.from({ length: total }, (_, index) => {
          const active = index < current;
          return (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full ${
                active
                  ? "bg-[color:var(--hc-primary)]"
                  : "bg-[color:var(--hc-border-subtle)]"
              }`}
            />
          );
        })}
      </div>
    </section>
  );
}
