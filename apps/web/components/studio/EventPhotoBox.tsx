"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppNav } from "@/components/layout/AppNav";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StudioPhotoExports } from "@/components/studio/StudioPhotoExports";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { listMyEvents, type MyEvent } from "@/lib/studio/accessApi";
import {
  deleteEventPhoto,
  getEventPhotoDownload,
  listEventPhotos,
  type Photo,
  type PhotoChannel,
  type PhotoFilter,
  type PhotoStatus,
} from "@/lib/studio/photosApi";

const STATUS_FILTERS: Array<{ value: PhotoStatus | ""; label: string }> = [
  { value: "", label: "전체" },
  { value: "DONE", label: "완성" },
  { value: "PENDING", label: "만드는 중" },
  { value: "FAILED", label: "실패" },
];

const CHANNEL_FILTERS: Array<{ value: PhotoChannel | ""; label: string }> = [
  { value: "", label: "모든 참가 방식" },
  { value: "BYOD", label: "개인 휴대폰" },
  { value: "BOOTH", label: "현장 부스" },
];

const FAILURE_LABEL: Record<string, string> = {
  COMPOSE_FAILED: "합성에 실패했어요",
  INPUT_MISSING: "촬영 사진이 빠졌어요",
  TIMEOUT: "시간이 너무 오래 걸렸어요",
};

/** 썸네일 주소는 5분이면 끝난다. 깨지면 목록을 다시 받는데, 여러 장이 한꺼번에 깨져도 한 번만 받는다. */
const THUMBNAIL_REFRESH_GAP_MS = 30_000;

/** 짧은 서명 URL 로 이동한다. 이 화면 주소가 Referer 로 저장소에 넘어가지 않게 noreferrer 링크를 쓴다. */
function openWithoutReferrer(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * 행사 사진함(R5 8·9절, ADR-0008 §3). 운영자와 행사 고객이 같이 쓴다 — 무엇을 할 수 있는지는 그 행사의 사진
 * 권한(보기 · 내려받기 · 지우기)이 정한다. 권한이 없는 동작은 버튼을 두지 않고, 서버도 다시 막는다.
 */
export function EventPhotoBox({ eventId }: { eventId: string }) {
  const [access, setAccess] = useState<MyEvent | null>(null);
  const [filter, setFilter] = useState<PhotoFilter>({});
  const [items, setItems] = useState<Photo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Photo | null>(null);
  const refreshedAtRef = useRef(0);
  // 목록 요청의 세대. 필터를 바꾸거나 첫 쪽을 다시 받으면 올린다 — 그 전에 시작한 응답(첫 쪽·더 보기)은 버린다.
  // 안 그러면 BOOTH 로 받던 응답이 BYOD 로 바꾼 뒤 도착해 목록·커서를 덮는다(Codex #542).
  const listGenerationRef = useRef(0);

  const permissions = new Set(access?.access.permissions ?? []);
  const canDownload = permissions.has("DOWNLOAD_PHOTOS");
  const canDelete = permissions.has("DELETE_PHOTOS");
  const canBulk = permissions.has("BULK_DOWNLOAD");
  const [selected, setSelected] = useState<number[]>([]);

  const loadFirst = useCallback(
    async (nextFilter: PhotoFilter) => {
      const generation = ++listGenerationRef.current;
      setLoading(true);
      try {
        const page = await listEventPhotos(eventId, nextFilter);
        if (generation !== listGenerationRef.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor ?? null);
        setError(null);
      } catch (cause) {
        if (generation !== listGenerationRef.current) return;
        setError(getUserFacingApiErrorMessage(cause, "사진을 불러오지 못했어요."));
      } finally {
        if (generation === listGenerationRef.current) setLoading(false);
      }
    },
    [eventId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void loadFirst({});
    listMyEvents()
      .then((list) => setAccess(list.find((e) => e.eventId === eventId) ?? null))
      .catch(() => {});
  }, [eventId, loadFirst]);

  const changeFilter = (next: PhotoFilter) => {
    setFilter(next);
    setSelected([]);
    void loadFirst(next);
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    const generation = listGenerationRef.current;
    setLoading(true);
    try {
      const page = await listEventPhotos(eventId, filter, nextCursor);
      if (generation !== listGenerationRef.current) return;
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor ?? null);
    } catch (cause) {
      if (generation !== listGenerationRef.current) return;
      setNotice(getUserFacingApiErrorMessage(cause, "더 불러오지 못했어요."));
    } finally {
      if (generation === listGenerationRef.current) setLoading(false);
    }
  };

  const onThumbnailError = () => {
    // 5분짜리 썸네일이 끝났다. 새 주소를 받으려고 첫 쪽부터 다시 받는다(더 본 쪽은 접는다).
    const now = Date.now();
    if (now - refreshedAtRef.current < THUMBNAIL_REFRESH_GAP_MS) return;
    refreshedAtRef.current = now;
    void loadFirst(filter);
  };

  const download = async (photo: Photo) => {
    setBusy(photo.photoId);
    setNotice(null);
    try {
      const { url } = await getEventPhotoDownload(eventId, photo.photoId);
      openWithoutReferrer(url);
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, "사진을 내려받지 못했어요."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (photo: Photo) => {
    setBusy(photo.photoId);
    setNotice(null);
    try {
      await deleteEventPhoto(eventId, photo.photoId);
      setItems((prev) => prev.filter((p) => p.photoId !== photo.photoId));
      setSelected((prev) => prev.filter((id) => id !== photo.photoId));
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, "사진을 지우지 못했어요."));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  return (
    <main className="hc-page-app min-h-dvh pb-16 text-(--hc-text)">
      <AppNav />
      <div className="mx-auto flex w-full max-w-200 flex-col gap-5 px-4 py-5 sm:py-6 lg:py-8">
        <Link
          href={access?.access.role ? `/studio/events/${encodeURIComponent(eventId)}` : "/studio"}
          className="text-[13px] text-(--hc-muted)"
        >
          ← {access?.access.role ? "행사 설정" : "행사 목록"}
        </Link>
        <h1 className="text-[30px] font-extrabold tracking-tight">{access?.name ? `${access.name} 사진함` : "사진함"}</h1>
        {/* 보관 종료 배치(ADR-0008 §7)가 기한이 지난 결과를 지운다 — 사진함에서도 빠진다. */}
        <p className="text-[13px] text-(--hc-muted)">
          사진은 만든 날부터 행사의 보관 기간이 지나면 지워져요. 필요한 사진은 미리 받아 두세요.
        </p>

        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            상태
            <select
              className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
              value={filter.status ?? ""}
              onChange={(e) => changeFilter({ ...filter, status: (e.target.value || undefined) as PhotoStatus | undefined })}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            참가 방식
            <select
              className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
              value={filter.channel ?? ""}
              onChange={(e) => changeFilter({ ...filter, channel: (e.target.value || undefined) as PhotoChannel | undefined })}
            >
              {CHANNEL_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <p role="alert" className="text-[14px] text-(--hc-danger)">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-[13px]">
            {notice}
          </p>
        ) : null}

        {!error && !loading && items.length === 0 ? (
          <p className="text-[14px] text-(--hc-muted)">아직 사진이 없어요.</p>
        ) : null}

        {canBulk ? (
          <StudioPhotoExports
            eventId={eventId}
            selectedIds={selected}
            channel={filter.channel}
            onCreated={() => setSelected([])}
          />
        ) : null}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((photo) => (
            <li key={photo.photoId} className="hc-surface-card flex flex-col gap-2 rounded-2xl p-2">
              {photo.status === "DONE" && photo.thumbnailUrl ? (
                // 서명 URL 이라 next/image 최적화를 거치지 않는다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.thumbnailUrl}
                  alt={`${formatTime(photo.createdAt)} 사진`}
                  onError={onThumbnailError}
                  className="aspect-3/4 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="flex aspect-3/4 w-full items-center justify-center rounded-xl bg-(--hc-surface-well) px-2 text-center text-[13px] text-(--hc-muted)">
                  {photo.status === "PENDING"
                    ? "만드는 중"
                    : (photo.failure && FAILURE_LABEL[photo.failure.code]) || "만들지 못했어요"}
                </div>
              )}
              <span className="flex items-center justify-between gap-2 text-[12px] text-(--hc-muted)">
                {formatTime(photo.createdAt)} · {photo.channel === "BOOTH" ? "부스" : "휴대폰"}
                {canBulk && photo.status === "DONE" ? (
                  <input
                    type="checkbox"
                    className="size-5"
                    aria-label={`${formatTime(photo.createdAt)} 사진 고르기`}
                    checked={selected.includes(photo.photoId)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, photo.photoId] : prev.filter((id) => id !== photo.photoId),
                      )
                    }
                  />
                ) : null}
              </span>
              {photo.status === "DONE" && (canDownload || canDelete) ? (
                <span className="flex gap-2">
                  {canDownload ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void download(photo)}
                      className="h-11 flex-1 rounded-full border border-(--hc-border) text-[13px] font-semibold disabled:opacity-50"
                    >
                      저장
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setConfirm(photo)}
                      className="h-11 rounded-full px-3 text-[13px] text-(--hc-danger) disabled:opacity-50"
                    >
                      지우기
                    </button>
                  ) : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        {nextCursor ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadMore()}
            className="hc-button-secondary h-11 self-center rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
          >
            {loading ? "불러오는 중…" : "더 보기"}
          </button>
        ) : null}
      </div>

      {confirm ? (
        <ConfirmDialog
          title="이 사진을 지울까요?"
          description="사진함에서 바로 빠지고, 참가자가 받은 결과 링크로도 더 받을 수 없어요. 되돌릴 수 없어요."
          confirmLabel="지우기"
          runningLabel="지우는 중…"
          running={busy === confirm.photoId}
          destructive
          onClose={() => setConfirm(null)}
          onConfirm={() => void remove(confirm)}
        />
      ) : null}
    </main>
  );
}
