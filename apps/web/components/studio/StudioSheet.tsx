"use client";

import { useId, type ReactNode } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";

/**
 * 게시 확인·성공처럼 한 번 멈춰 읽어야 하는 내용을 담는 시트. 휴대폰에서는 아래에서 올라오고 넓은 화면에서는 가운데 뜬다.
 * 닫는 길은 배경 · Escape · 안쪽 버튼이고, `closable` 이 false 면(요청 중) 닫히지 않는다. 요청 중에는 반드시 끝나야 한다.
 */
export function StudioSheet({
  title,
  description,
  closable = true,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  closable?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const requestClose = () => {
    if (closable) onClose();
  };
  const dialogRef = useModalDialog(true, requestClose);
  return (
    <div className="fixed inset-0 z-120 flex items-end justify-center hc-modal sm:items-center sm:px-4 sm:py-6">
      <button type="button" aria-label="닫기" onClick={requestClose} className="absolute inset-0" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="hc-surface-card relative flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-(--hc-card-shadow) sm:rounded-3xl"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id={`${id}-title`} className="text-[18px] font-extrabold">
            {title}
          </h2>
          {description ? (
            <p id={`${id}-desc`} className="text-[13px] leading-[1.6] text-(--hc-muted)">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
