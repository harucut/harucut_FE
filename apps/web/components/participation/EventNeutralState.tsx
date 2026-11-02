"use client";

/**
 * 행사 경로의 없는 주소·오류 화면. 행사 정보를 받기 전이라 중립 색이고, 하루컷 이름과 홈 링크를 두지 않는다(기획 R5 18절).
 */
export function EventNeutralState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="ev-surface flex min-h-dvh flex-col items-center justify-center px-6">
      <div role="alert" className="flex w-full max-w-md flex-col gap-3">
        <h1 className="break-keep text-[24px] font-extrabold leading-[1.25] tracking-[-0.02em]">{title}</h1>
        <p className="break-keep text-[16px] leading-relaxed text-(--ev-muted)">{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 h-14 rounded-full bg-(--ev-accent) text-[16px] font-extrabold text-(--ev-accent-contrast)"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </main>
  );
}
