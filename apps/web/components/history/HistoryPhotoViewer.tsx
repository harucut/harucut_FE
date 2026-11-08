"use client";

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Ellipsis, PencilLine, Share2, Trash2 } from "lucide-react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { getUserMediaDate, getUserMediaPreviewUrl, getUserMediaTitle } from "@/lib/userMediaPreview";
import type { UserMedia } from "@/lib/api-types";

/** 이만큼 밀면 옆 사진으로 넘어간다(스튜디오 사진 보기와 같은 값). */
const SWIPE_THRESHOLD_PX = 48;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 기록 화면의 한 줄 알림. 성공과 실패를 같은 색으로 그리지 않으려고 종류를 함께 들고 다닌다.
 * 목록 위 띠와 보기 화면이 같은 모양을 쓴다.
 */
export type HistoryNoticeValue = { kind: "ok" | "error"; text: string };

export function HistoryNotice({ notice }: { notice: HistoryNoticeValue }) {
  return (
    <div
      role="status"
      className={
        notice.kind === "ok"
          ? "hc-feedback rounded-2xl border px-4 py-3 text-[12px]"
          : "rounded-2xl border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) px-4 py-3 text-[12px] text-(--hc-danger)"
      }
    >
      {notice.text}
    </div>
  );
}

/** "2026년 11월 8일 토요일". 날짜가 없으면 null. */
function fullDateLabel(item: UserMedia) {
  const date = getUserMediaDate(item);
  if (!date) return null;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
}

/**
 * 축소본을 먼저 보이고, 원본이 다 오면 그 위에 덮는다.
 *
 * 목록 축소본은 긴 변 512px 라 크게 보면 흐리다. 원본(최대 2000×6000)은 휴대폰 회선에서 몇 초
 * 걸리니 그동안 빈 화면을 두지 않는다. 두 장 모두 칸을 채우고 object-contain 으로 그려서, 비율이
 * 같은 같은 사진이 정확히 겹친다. 그림자는 겉 상자에 drop-shadow 로 건다 — 사진 모양을 따라가고,
 * 두 장이 겹쳐도 한 번만 그려진다.
 */
function ViewerPhoto({ item, title }: { item: UserMedia; title: string }) {
  const preview = getUserMediaPreviewUrl(item);
  const full = item.viewUrl?.trim() || null;
  const [fullReady, setFullReady] = useState(false);

  if (!preview) {
    return <p className="text-[13px] text-(--hc-muted)">미리보기를 준비하는 중이에요.</p>;
  }

  return (
    <div className="grid size-full grid-cols-1 grid-rows-1 drop-shadow-[0_18px_40px_rgba(20,20,15,0.22)]">
      {/* 서명 URL 이라 next/image 최적화를 거치지 않는다. 주소가 Referer 로 새지 않게 한다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview}
        alt={title}
        referrerPolicy="no-referrer"
        draggable={false}
        className="col-start-1 row-start-1 size-full select-none object-contain"
      />
      {full && full !== preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={full}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setFullReady(true)}
          className={`col-start-1 row-start-1 size-full select-none object-contain transition-opacity ${
            fullReady ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
    </div>
  );
}

type Props = {
  /** 목록과 같은 순서(최신 먼저). 옆으로 넘기면 이 순서를 따른다. */
  items: UserMedia[];
  index: number;
  notice: HistoryNoticeValue | null;
  downloading: boolean;
  sharing: boolean;
  /** 이름 바꾸기·지우기 창이 위에 떠 있다. 그동안 화살표 키로 사진을 넘기지 않는다(입력칸의 커서 이동이다). */
  covered: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDownload: (item: UserMedia) => void;
  onShare: (item: UserMedia) => void;
  onRename: (item: UserMedia) => void;
  onDelete: (item: UserMedia) => void;
};

/**
 * 기록 하나를 크게 본다(2026-11-09, 기록 카드 시안 C안).
 *
 * 목록 카드마다 저장·공유·지우기 버튼 세 개가 줄을 채워, 기록이 쌓이면 사진보다 버튼이 많았다.
 * 버튼은 여기로 모았다 — 사진첩 앱처럼 고르고, 크게 보고, 저장한다. 가장 하고 싶은 일(저장)이
 * 라임 주버튼이고, 되돌릴 수 없는 지우기는 이름 바꾸기와 함께 ⋯ 안에 둔다.
 *
 * 옆 사진으로는 밀어서(터치), 화살표 키로, 넓은 화면에서는 좌우 버튼으로 넘긴다. 달력에서 하루에
 * 여러 장인 날을 열어도 같은 날 사진이 목록 순서상 이웃이라 그대로 넘겨 본다.
 */
export function HistoryPhotoViewer({
  items,
  index,
  notice,
  downloading,
  sharing,
  covered,
  onIndexChange,
  onClose,
  onDownload,
  onShare,
  onRename,
  onDelete,
}: Props) {
  const item = items[index];
  // 메뉴는 어느 사진의 것인지로 든다 — 옆 사진으로 넘기면 저절로 닫힌다.
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const menuOpen = item !== undefined && menuFor === item.mediaId;
  const menuBoxRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const swipeRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const titleId = useId();
  const menuId = useId();
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  // Escape 는 메뉴부터 닫는다. 메뉴가 없을 때 보기 화면을 닫는다.
  const dialogRef = useModalDialog(true, () => {
    if (!menuOpen) {
      onClose();
      return;
    }
    setMenuFor(null);
    moreButtonRef.current?.focus();
  });

  useEffect(() => {
    if (covered) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      if (event.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [covered, hasNext, hasPrev, index, onIndexChange]);

  // 메뉴 밖을 누르면 닫는다.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuBoxRef.current?.contains(event.target as Node)) setMenuFor(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swipeRef.current = { pointerId: event.pointerId, startX: event.clientX };
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipe.startX;
    if (dx <= -SWIPE_THRESHOLD_PX && hasNext) onIndexChange(index + 1);
    if (dx >= SWIPE_THRESHOLD_PX && hasPrev) onIndexChange(index - 1);
  };

  if (!item) return null;
  const title = getUserMediaTitle(item);
  const dateLabel = fullDateLabel(item);
  const roundButton =
    "hc-button-secondary grid size-13 shrink-0 place-items-center rounded-full border disabled:opacity-50";
  // 폰에서는 밀어서 넘긴다. 좌우 버튼은 사진 가장자리를 가리지 않는 넓은 화면에만 둔다.
  const arrow =
    "hc-button-secondary absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border disabled:opacity-30 max-sm:hidden";
  const menuItem = "flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold transition hover:bg-(--hc-surface-muted)";

  return (
    <div className="hc-page-app fixed inset-0 z-110">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-auto flex size-full max-w-xl flex-col"
      >
        <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="hc-button-secondary grid size-11 place-items-center rounded-full border"
          >
            <ChevronLeft aria-hidden className="size-4.5" />
          </button>
          <p className="font-mono text-[13px] tabular-nums text-(--hc-muted)">
            {index + 1} / {items.length}
          </p>
          <span aria-hidden className="size-11" />
        </header>

        <div
          className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-5 py-4"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            swipeRef.current = null;
          }}
        >
          <button
            type="button"
            aria-label="이전 사진"
            disabled={!hasPrev}
            onClick={() => onIndexChange(index - 1)}
            className={`${arrow} left-0`}
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <ViewerPhoto key={item.mediaId} item={item} title={title} />
          <button
            type="button"
            aria-label="다음 사진"
            disabled={!hasNext}
            onClick={() => onIndexChange(index + 1)}
            className={`${arrow} right-0`}
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>

        <div className="px-5">
          <h2 id={titleId} className="truncate text-[18px] font-extrabold tracking-tight">
            {title}
          </h2>
          {dateLabel ? <p className="mt-1 text-[13px] text-(--hc-muted)">{dateLabel}</p> : null}
        </div>

        <footer className="flex flex-col gap-3 px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-5">
          {/* 결과는 여기서 말한다. 목록 위 띠는 이 화면에 가려 보이지 않는다. */}
          {notice ? <HistoryNotice notice={notice} /> : null}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => onDownload(item)}
              disabled={downloading}
              className="hc-button-primary flex h-13 flex-1 items-center justify-center gap-2 rounded-full text-[16px] font-extrabold disabled:opacity-60"
            >
              <Download aria-hidden className="size-4.5" strokeWidth={2.2} />
              {downloading ? "저장 중" : "사진 저장"}
            </button>
            <button
              type="button"
              aria-label="공유"
              aria-busy={sharing}
              onClick={() => onShare(item)}
              disabled={sharing}
              className={roundButton}
            >
              <Share2 aria-hidden className="size-5" />
            </button>
            <div ref={menuBoxRef} className="relative">
              <button
                ref={moreButtonRef}
                type="button"
                aria-label="더보기"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                onClick={() => setMenuFor(menuOpen ? null : item.mediaId)}
                className={roundButton}
              >
                <Ellipsis aria-hidden className="size-5" />
              </button>
              {menuOpen ? (
                <div
                  id={menuId}
                  className="hc-surface-card absolute bottom-full right-0 mb-2 flex w-44 flex-col rounded-2xl border p-1.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null);
                      onRename(item);
                    }}
                    className={menuItem}
                  >
                    <PencilLine aria-hidden className="size-4.5" />
                    이름 바꾸기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null);
                      onDelete(item);
                    }}
                    className={`${menuItem} text-(--hc-danger)`}
                  >
                    <Trash2 aria-hidden className="size-4.5" />
                    지우기
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
