"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { getEventPhotoDownload, type Photo } from "@/lib/studio/photosApi";

/** 원본 주소(5분)를 이만큼만 다시 쓴다. 넘으면 새로 받는다. */
const FULL_URL_TTL_MS = 4 * 60_000;
/** 이만큼 밀면 다음 사진으로 넘어간다. */
const SWIPE_THRESHOLD_PX = 48;

/**
 * 사진 크게 보기. 썸네일을 먼저 보여 주고, 내려받기 권한이 있으면 원본으로 바꾼다 — 사진함 썸네일은 긴 변 512px 라
 * 크게 보면 흐리다. 원본을 못 받아도 보는 데는 문제가 없으니 알리지 않는다.
 */
export function EventPhotoViewer({
  eventId,
  photos,
  index,
  canDownload,
  canDelete,
  busy,
  notice,
  label,
  onIndexChange,
  onClose,
  onDownload,
  onDelete,
  onRevokeLinks,
}: {
  eventId: string;
  /** 볼 수 있는 사진(완성본)만. */
  photos: Photo[];
  index: number;
  canDownload: boolean;
  canDelete: boolean;
  busy: boolean;
  notice: string | null;
  label: (photo: Photo) => string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDownload: (photo: Photo) => void;
  onDelete: (photo: Photo) => void;
  /** 잘못 보낸 결과 링크를 거둔다. 사진은 남는다. 지울 권한이 있는 사람만 한다. */
  onRevokeLinks: (photo: Photo) => void;
}) {
  const photo = photos[index];
  const photoId = photo?.photoId;
  const [full, setFull] = useState<Record<number, { url: string; at: number }>>({});
  const requestedRef = useRef(new Map<number, number>());
  const swipeRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const dialogRef = useModalDialog(true, onClose);
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    if (!canDownload || photoId === undefined) return;
    const requestedAt = requestedRef.current.get(photoId);
    if (requestedAt !== undefined && Date.now() - requestedAt < FULL_URL_TTL_MS) return;
    requestedRef.current.set(photoId, Date.now());
    let cancelled = false;
    getEventPhotoDownload(eventId, photoId)
      .then((result) => {
        if (!cancelled && result?.url) setFull((prev) => ({ ...prev, [photoId]: { url: result.url, at: Date.now() } }));
      })
      .catch(() => {
        requestedRef.current.delete(photoId);
      });
    return () => {
      cancelled = true;
    };
  }, [canDownload, eventId, photoId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      if (event.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasNext, hasPrev, index, onIndexChange]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeRef.current = { pointerId: event.pointerId, startX: event.clientX };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipe.startX;
    if (dx <= -SWIPE_THRESHOLD_PX && hasNext) onIndexChange(index + 1);
    if (dx >= SWIPE_THRESHOLD_PX && hasPrev) onIndexChange(index - 1);
  };

  if (!photo) return null;
  const src = (photoId !== undefined ? full[photoId]?.url : undefined) ?? photo.thumbnailUrl ?? undefined;
  const arrow =
    "absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-white transition enabled:hover:bg-white/24 disabled:opacity-30";

  return (
    <div className="fixed inset-0 z-110 bg-black" >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label(photo)}
        className="flex size-full flex-col text-white"
      >
        <header className="flex min-h-14 items-center justify-between gap-3 px-3 pt-[env(safe-area-inset-top)]">
          <p className="min-w-0 truncate pl-1 text-[13px] text-white/80">
            {label(photo)} ·{" "}
            <span className="font-mono tabular-nums">
              {index + 1}/{photos.length}
            </span>
          </p>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full transition hover:bg-white/12"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>

        <div
          className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-3"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            swipeRef.current = null;
          }}
        >
          <button type="button" aria-label="이전 사진" disabled={!hasPrev} onClick={() => onIndexChange(index - 1)} className={`${arrow} left-2`}>
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          {src ? (
            // 서명 URL 이라 next/image 최적화를 거치지 않는다. 주소가 Referer 로 새지 않게 한다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.photoId}
              src={src}
              alt={label(photo)}
              referrerPolicy="no-referrer"
              draggable={false}
              className="max-h-full max-w-full select-none object-contain"
            />
          ) : null}
          <button type="button" aria-label="다음 사진" disabled={!hasNext} onClick={() => onIndexChange(index + 1)} className={`${arrow} right-2`}>
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>

        <footer className="flex flex-col items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {notice ? (
            <p role="status" className="text-center text-[13px] text-white/85">
              {notice}
            </p>
          ) : null}
          {canDownload || canDelete ? (
            <div className="flex w-full max-w-sm gap-2">
              {canDownload ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDownload(photo)}
                  className="h-11 flex-1 rounded-full bg-white text-[14px] font-semibold text-black transition disabled:opacity-50"
                >
                  저장
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(photo)}
                  className="h-11 rounded-full border border-white/25 px-5 text-[14px] font-semibold text-white transition enabled:hover:bg-white/12 disabled:opacity-50"
                >
                  지우기
                </button>
              ) : null}
            </div>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRevokeLinks(photo)}
              className="flex min-h-11 items-center px-3 text-[13px] font-semibold text-white/80 underline underline-offset-4 disabled:opacity-50"
            >
              보낸 링크 끊기
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
