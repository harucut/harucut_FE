import { Sentences } from "@/components/ui/Sentences";

/**
 * 「다시 시도」 단추 하나(2026-11-14). 개인 화면의 다시 시도는 모두 이 모양이다.
 *
 * 예전에는 화면마다 크기가 달랐다 — 11px 글자의 작은 알약(저장한 프레임·MY 통계)부터 13px 알약까지 섞여
 * 있었고, 작은 것은 터치 화면의 최소 높이(44px) 규칙에 세로로 늘어나 글자만 작은 타원이 됐다.
 */
export function RetryButton({
  onClick,
  disabled,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`hc-button-secondary inline-flex h-11 items-center justify-center rounded-full border px-5 text-[13px] font-semibold disabled:opacity-50 ${className}`}
    >
      다시 시도
    </button>
  );
}

/**
 * 목록을 못 불러왔을 때의 자리 — 문장 하나와 「다시 시도」(2026-11-14). 홈의 최근 기록·기록·저장한 프레임이
 * 같은 모양이다.
 *
 * 실패를 빈 목록으로 위장하지 않는다. 「…불러오지 못했어요」가 이미 없어진 것이 아니라는 말이라 덧붙이는
 * 문장은 두지 않는다(「저장한 프레임이 사라진 것은 아니에요…」를 뺐다).
 */
export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="hc-surface-well flex flex-col items-center gap-3 rounded-[20px] border border-dashed p-6 text-center">
      <p role="alert" className="text-[13px] text-(--hc-muted)">
        <Sentences text={message} />
      </p>
      <RetryButton onClick={onRetry} />
    </div>
  );
}
