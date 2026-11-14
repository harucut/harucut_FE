"use client";

import Link from "next/link";
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
    <div className="fixed inset-0 z-120 flex items-end justify-center hc-modal px-4 py-6 sm:items-center">
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
        {/*
          제목 아래는 단추 둘뿐이다(2026-11-14). 예전에는 카드마다 아이콘 타일과 설명 한 줄(「카메라로 8장 찍고 네 컷
          고르기」·「갤러리에서 골라 네 컷 만들기」)이 붙었다 — 「사진 찍기」「사진 불러오기」가 이미 그 말이고, 몇 장
          찍는지는 촬영 화면이 말한다. 부제도 두지 않는다. 다른 확인 창과 같은 모양(라임 주 단추 + 테두리 단추)이다.
        */}
        <h2 id="record-source-title" className="text-[18px] font-extrabold">
          어떻게 남길까요?
        </h2>

        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/shoot"
            onClick={onClose}
            className="hc-button-primary flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-extrabold"
          >
            사진 찍기
          </Link>
          <Link
            href="/shoot?source=upload"
            onClick={onClose}
            className="hc-button-secondary flex h-12 items-center justify-center rounded-full border px-5 text-[15px] font-extrabold"
          >
            사진 불러오기
          </Link>
        </div>
      </div>
    </div>
  );
}
