import type { FrameId } from "@/constants/frames";

type FramePreviewProps = {
  variant: FrameId;
  selected?: boolean;
  className?: string;
};

export function FramePreview({
  variant,
  selected,
  className = "",
}: FramePreviewProps) {
  const outer = [
    "rounded-2xl border bg-zinc-900/80 p-2 transition-all",
    selected
      ? "border-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.6)]"
      : "border-zinc-700",
    "w-full max-w-xs mx-auto",
    className,
  ].join(" ");

  const slotBase = "bg-zinc-800/90 rounded-md";

  // 1번: 세로로 길면서 아래에 공간 있는 4컷 (4x1 + 라벨 영역)
  if (variant === "classic-4") {
    return (
      <div className={outer}>
        <div className={`aspect-[3/4] mb-15 flex flex-col gap-1`}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${slotBase} flex-[3]`} />
          ))}
        </div>
      </div>
    );
  }

  // 2번: 전체가 가로로 길고, 각 칸도 가로로 보이는 2x2
  // (가로로 넓고 세로는 짧게)
  if (variant === "wide-4") {
    return (
      <div className={outer}>
        <div className={`aspect-[16/9] mr-10 grid grid-cols-2 gap-1`}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={slotBase} />
          ))}
        </div>
      </div>
    );
  }

  // 3번: 위아래 차이 없는 2x2 그리드
  if (variant === "grid-4") {
    return (
      <div className={outer}>
        <div className={`aspect-[3/4] mb-15 grid grid-cols-2 gap-1`}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={slotBase} />
          ))}
        </div>
      </div>
    );
  }

  // 4번: 세로로 길고, 2x2인데 오른쪽 컬럼이 살짝 아래로 내려간 형태
  if (variant === "polaroid-4") {
    return (
      <div className={outer}>
        <div className={`aspect-[3/4] mb-7.5 mt-7.5 grid grid-cols-2 gap-1`}>
          <div className="mb-10 flex flex-col gap-1">
            <div className={`${slotBase} flex-1`} />
            <div className={`${slotBase} flex-1`} />
          </div>
          <div className="mt-10 flex flex-col gap-1">
            <div className={`${slotBase} flex-1`} />
            <div className={`${slotBase} flex-1`} />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
