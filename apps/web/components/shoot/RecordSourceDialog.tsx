"use client";

import Link from "next/link";
import { Camera, ChevronRight, ImagePlus } from "lucide-react";
import { useModalDialog } from "@/hooks/useModalDialog";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * "기록을 어떻게 남길지" 고르는 자리 — 카메라로 찍거나, 갤러리에서 불러오거나.
 *
 * 두 길은 **사진이 어디서 오는지만 다르다.** 프레임 고르기부터 4장 고르기·서버 합성·
 * 내려받기까지는 같은 화면을 지나므로, 여기서 정하는 것은 사실상 첫 화면 하나다.
 * 그래서 무엇으로 갈지는 상태가 아니라 주소가 들고 간다(`/shoot?source=upload`).
 *
 * 링크로 두는 이유: 사용자가 새 탭으로 열거나 주소를 복사할 수 있어야 한다.
 * onClick 으로 router.push 를 하면 그게 전부 막힌다.
 */
export function RecordSourceDialog({ open, onClose }: Props) {
  const dialogRef = useModalDialog(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-120 flex items-end justify-center bg-[rgba(10,24,45,0.42)] px-4 py-6 sm:items-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-source-title"
        className="hc-surface-card relative w-full max-w-sm rounded-3xl border p-5 shadow-(--hc-card-shadow)"
      >
        {/* 부제는 두지 않는다 — 아래 두 카드가 이미 각자 무엇인지 말한다. */}
        <h2 id="record-source-title" className="text-[18px] font-extrabold">
          어떻게 남길까요?
        </h2>

        <div className="mt-4 flex flex-col gap-2.5">
          <Link
            href="/shoot"
            onClick={onClose}
            className="flex items-center gap-3.5 rounded-2xl bg-(--hc-primary) p-4 text-(--hc-primary-contrast) shadow-(--hc-button-shadow)"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#06140A]">
              <Camera className="h-5.5 w-5.5 text-(--hc-primary-strong)" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">촬영하기</span>
              <span className="mt-0.5 block text-[12px] font-medium opacity-75">
                카메라로 8장 찍고 네 컷 고르기
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0" />
          </Link>

          <Link
            href="/shoot?source=upload"
            onClick={onClose}
            className="hc-surface-card flex items-center gap-3.5 rounded-2xl border p-4 transition hover:border-(--hc-border-strong)"
          >
            <span className="hc-accent-chip grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border">
              <ImagePlus className="h-5.5 w-5.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">사진 불러오기</span>
              <span className="mt-0.5 block text-[12px] text-(--hc-muted)">
                갤러리에서 골라 네 컷 만들기
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-(--hc-muted)" />
          </Link>
        </div>
      </div>
    </div>
  );
}
