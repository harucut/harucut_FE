"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { AppNav } from "@/components/layout/AppNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EventPhotoViewer } from "@/components/studio/EventPhotoViewer";
import { SingleFieldDialog } from "@/components/ui/SingleFieldDialog";
import { StudioPhotoExports } from "@/components/studio/StudioPhotoExports";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { dayEndToServer, dayStartToServer } from "@/lib/studio/eventTime";
import { NativeSaveError, getNativeSaveErrorMessage, nativeSaveImageUrl } from "@/lib/nativeBridge";
import { withRequestDeadline } from "@/lib/requestDeadline";
import { listMyEvents, type MyEvent } from "@/lib/studio/accessApi";
import {
  deleteEventPhoto,
  revokeEventPhotoResultAccess,
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

/** 지우기 요청 상한. 확인 창은 실행 중에 닫히지 않으므로 요청이 반드시 끝나야 한다(ConfirmDialog 주석). */
const DELETE_DEADLINE_MS = 30_000;

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

/** 목록에 나온 프레임을 처음 본 순서대로 모은다. */
function mergeFrames(known: number[], photos: Photo[]) {
  const merged = [...known];
  for (const photo of photos) {
    if (photo.frameVersionId && !merged.includes(photo.frameVersionId)) merged.push(photo.frameVersionId);
  }
  return merged;
}

/**
 * 행사 사진함(R5 8·9절, ADR-0008 §3). 운영자와 행사 고객이 같이 쓴다 — 무엇을 할 수 있는지는 그 행사의 사진
 * 권한(보기 · 내려받기 · 지우기)이 정한다. 권한이 없는 동작은 버튼을 두지 않고, 서버도 다시 막는다.
 */
export function EventPhotoBox({ eventId }: { eventId: string }) {
  const [access, setAccess] = useState<MyEvent | null>(null);
  const [filter, setFilter] = useState<PhotoFilter>({});
  // 날짜 칸의 값(YYYY-MM-DD). 서버로는 그날의 시작·끝 시각으로 보낸다.
  const [days, setDays] = useState<{ from: string; to: string }>({ from: "", to: "" });
  // 지금까지 본 프레임. 필터로 목록이 좁아져도 다른 프레임으로 바꿀 수 있게 지우지 않는다.
  const [seenFrames, setSeenFrames] = useState<number[]>([]);
  const [items, setItems] = useState<Photo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Photo | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Photo | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  // 크게 보는 사진. 목록이 바뀌어도 그 사진을 따라가게 번호가 아니라 id 로 기억한다.
  const [viewingId, setViewingId] = useState<number | null>(null);
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
        setSeenFrames((prev) => mergeFrames(prev, page.items));
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

  const changeDays = (next: { from: string; to: string }) => {
    setDays(next);
    changeFilter({ ...filter, from: dayStartToServer(next.from), to: dayEndToServer(next.to) });
  };

  const clearFilter = () => {
    setDays({ from: "", to: "" });
    changeFilter({});
  };

  const changeFilter = (next: PhotoFilter) => {
    setFilter(next);
    setSelected([]);
    // 이전 필터의 목록·커서를 바로 버린다. 새 첫 쪽이 실패해도 「더 보기」가 새 필터에 이전 커서를 붙이지 않게(Codex #542).
    setItems([]);
    setNextCursor(null);
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
      setSeenFrames((prev) => mergeFrames(prev, page.items));
      setNextCursor(page.nextCursor ?? null);
    } catch (cause) {
      if (generation !== listGenerationRef.current) return;
      setNotice(getUserFacingApiErrorMessage(cause, "더 불러오지 못했어요. 「더 보기」를 다시 눌러 주세요."));
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
      // 앱 셸 안에서는 링크를 열면 외부 브라우저로 나간다 — 네이티브가 내려받아 사진첩에 넣는다.
      const native = await nativeSaveImageUrl(url, `harucut-${photo.photoId}.jpg`);
      if (native) {
        if (!native.ok) throw new NativeSaveError(native);
        setNotice("사진첩에 저장했어요.");
        return;
      }
      openWithoutReferrer(url);
    } catch (cause) {
      setNotice(
        cause instanceof NativeSaveError
          ? (getNativeSaveErrorMessage(cause) ?? "사진첩에 저장하지 못했어요.")
          : getUserFacingApiErrorMessage(cause, "사진을 내려받지 못했어요. 잠시 뒤 다시 눌러 주세요."),
      );
    } finally {
      setBusy(null);
    }
  };

  const remove = async (photo: Photo) => {
    setBusy(photo.photoId);
    setNotice(null);
    try {
      await withRequestDeadline(DELETE_DEADLINE_MS, (signal) => deleteEventPhoto(eventId, photo.photoId, signal));
      // 크게 보던 사진을 지웠으면 다음 사진으로 넘어간다. 마지막 장이면 그 앞으로, 남은 게 없으면 닫는다.
      const viewable = items.filter((p) => p.status === "DONE" && p.thumbnailUrl);
      const at = viewable.findIndex((p) => p.photoId === photo.photoId);
      const neighbor = viewable[at + 1] ?? viewable[at - 1] ?? null;
      setViewingId((current) => (current === photo.photoId ? (neighbor?.photoId ?? null) : current));
      setItems((prev) => prev.filter((p) => p.photoId !== photo.photoId));
      setSelected((prev) => prev.filter((id) => id !== photo.photoId));
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, "사진을 지우지 못했어요. 잠시 뒤 다시 눌러 주세요."));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const revokeLinks = async (photo: Photo, reason: string) => {
    setBusy(photo.photoId);
    setRevokeError(null);
    try {
      const { revokedCount } = await revokeEventPhotoResultAccess(eventId, photo.photoId, reason);
      setNotice(revokedCount > 0 ? `이 사진의 결과 링크 ${revokedCount}개를 끊었어요. 사진은 그대로예요.` : "끊을 결과 링크가 없어요.");
      setRevokeTarget(null);
    } catch (cause) {
      setRevokeError(getUserFacingApiErrorMessage(cause, "링크를 끊지 못했어요. 잠시 뒤 다시 눌러 주세요."));
    } finally {
      setBusy(null);
    }
  };

  const backHref = access?.access.role ? `/studio/events/${encodeURIComponent(eventId)}` : "/studio";
  const backLabel = access?.access.role ? "행사 설정" : "행사 목록";
  const viewable = items.filter((p) => p.status === "DONE" && p.thumbnailUrl);
  const viewingIndex = viewingId === null ? -1 : viewable.findIndex((p) => p.photoId === viewingId);
  const hasFilter = Boolean(filter.status || filter.channel || filter.from || filter.to || filter.frameVersionId);
  const photoLabel = (photo: Photo) => `${formatTime(photo.createdAt)} 사진`;

  return (
    <main className={`hc-page-app min-h-dvh text-(--hc-text) ${selected.length > 0 ? "pb-28" : "pb-16"}`}>
      <AppNav />
      <div className="mx-auto flex w-full max-w-250 flex-col gap-5 px-4 py-5 sm:py-6 lg:py-8">
        <div className="lg:hidden">
          <PageHeader backHref={backHref} backLabel={backLabel} />
        </div>
        <Link
          href={backHref}
          className="hidden h-11 w-fit items-center gap-1 text-[13px] font-semibold text-(--hc-muted) transition hover:text-(--hc-text) lg:flex"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {backLabel}
        </Link>
        <h1 className="break-words text-[30px] font-extrabold tracking-tight">{access?.name ? `${access.name} 사진함` : "사진함"}</h1>
        {/* 보관 종료 배치(ADR-0008 §7)가 기한이 지난 결과를 지운다 — 사진함에서도 빠진다. */}
        <p className="max-w-[65ch] text-[13px] text-(--hc-muted)">
          사진은 만든 날부터 행사의 보관 기간이 지나면 지워져요. 필요한 사진은 미리 받아 두세요.
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            상태
            <select
              name="photoStatus"
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
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            참가 방식
            <select
              name="photoChannel"
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
          {seenFrames.length > 1 ? (
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              프레임
              <select
                name="photoFrame"
                className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
                value={filter.frameVersionId ?? ""}
                onChange={(e) => changeFilter({ ...filter, frameVersionId: e.target.value ? Number(e.target.value) : undefined })}
              >
                <option value="">모든 프레임</option>
                {seenFrames.map((frameVersionId, index) => (
                  <option key={frameVersionId} value={frameVersionId}>
                    프레임 {index + 1}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            시작일
            <input
              type="date"
              name="photoFromDay"
              className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
              value={days.from}
              max={days.to || undefined}
              onChange={(e) => changeDays({ ...days, from: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            종료일
            <input
              type="date"
              name="photoToDay"
              className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
              value={days.to}
              min={days.from || undefined}
              onChange={(e) => changeDays({ ...days, to: e.target.value })}
            />
          </label>
        </div>

        {error ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-[14px] text-(--hc-danger)">
              {error}
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadFirst(filter)}
              className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
            >
              다시 시도
            </button>
          </div>
        ) : null}
        {notice && viewingIndex < 0 ? (
          <p role="status" className="text-[13px]">
            {notice}
          </p>
        ) : null}

        {!error && loading && items.length === 0 ? (
          <p role="status" className="text-[14px] text-(--hc-muted)">
            사진을 불러오는 중…
          </p>
        ) : null}
        {!error && !loading && items.length === 0 ? (
          hasFilter ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[14px] text-(--hc-muted)">이 조건에 맞는 사진이 없어요.</p>
              <button
                type="button"
                onClick={clearFilter}
                className="h-11 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold transition hover:border-(--hc-border-strong)"
              >
                조건 지우기
              </button>
            </div>
          ) : (
            <p className="text-[14px] text-(--hc-muted)">아직 찍은 사진이 없어요. 참가자가 사진을 만들면 여기에 모여요.</p>
          )
        ) : null}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((photo) => (
            <li key={photo.photoId} className="relative flex flex-col gap-1.5">
              {photo.status === "DONE" && photo.thumbnailUrl ? (
                <button
                  type="button"
                  aria-label={`${photoLabel(photo)} 크게 보기`}
                  onClick={() => setViewingId(photo.photoId)}
                  className="block w-full overflow-hidden rounded-2xl border border-(--hc-border) bg-(--hc-surface-well) transition hover:border-(--hc-border-strong)"
                >
                  {/*
                    사진을 자르지 않는다. 세로 네 컷도 한 장 전체가 보여야 어떤 사진인지 안다.
                    서명 URL 이라 next/image 최적화를 거치지 않는다.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnailUrl}
                    alt={photoLabel(photo)}
                    loading="lazy"
                    onError={onThumbnailError}
                    className="aspect-3/4 w-full object-contain"
                  />
                </button>
              ) : (
                <div className="flex aspect-3/4 w-full items-center justify-center rounded-2xl border border-(--hc-border) bg-(--hc-surface-well) px-2 text-center text-[13px] text-(--hc-muted)">
                  {photo.status === "PENDING"
                    ? "만드는 중"
                    : (photo.failure && FAILURE_LABEL[photo.failure.code]) || "만들지 못했어요"}
                </div>
              )}
              <span className="text-[12px] text-(--hc-muted)">
                {formatTime(photo.createdAt)} · {photo.channel === "BOOTH" ? "부스" : "휴대폰"}
              </span>
              {canBulk && photo.status === "DONE" ? (
                <label className="absolute left-0 top-0 grid size-11 cursor-pointer place-items-center">
                  <input
                    type="checkbox"
                    className="size-5"
                    // 필터를 바꿔 새 목록을 받는 동안에는 이전 목록의 사진을 고르지 못하게 한다(Codex #543).
                    disabled={loading}
                    aria-label={`${formatTime(photo.createdAt)} 사진 고르기`}
                    checked={selected.includes(photo.photoId)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, photo.photoId] : prev.filter((id) => id !== photo.photoId),
                      )
                    }
                  />
                </label>
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

        {canBulk ? (
          <StudioPhotoExports
            eventId={eventId}
            selectedIds={selected}
            filter={{ channel: filter.channel, from: filter.from, to: filter.to, frameVersionId: filter.frameVersionId }}
            onCreated={() => setSelected([])}
            onClearSelection={() => setSelected([])}
          />
        ) : null}
      </div>

      {viewingIndex >= 0 ? (
        <EventPhotoViewer
          eventId={eventId}
          photos={viewable}
          index={viewingIndex}
          canDownload={canDownload}
          canDelete={canDelete}
          busy={busy !== null}
          notice={notice}
          label={photoLabel}
          onIndexChange={(index) => setViewingId(viewable[index]?.photoId ?? null)}
          onClose={() => setViewingId(null)}
          onDownload={(photo) => void download(photo)}
          onDelete={(photo) => setConfirm(photo)}
          onRevokeLinks={(photo) => {
            setRevokeError(null);
            setRevokeTarget(photo);
          }}
        />
      ) : null}

      {revokeTarget ? (
        <SingleFieldDialog
          title="보낸 링크를 끊을까요?"
          description="이 사진으로 보낸 링크가 모두 열리지 않아요. 사진은 지워지지 않고, 필요하면 새 링크를 만들 수 있어요."
          label="끊는 이유"
          placeholder="예: 다른 분께 잘못 보냈어요"
          initialValue=""
          maxLength={200}
          submitLabel="링크 끊기"
          submittingLabel="끊는 중"
          destructive
          saving={busy === revokeTarget.photoId}
          error={revokeError}
          onClose={() => setRevokeTarget(null)}
          onSubmit={(reason) => void revokeLinks(revokeTarget, reason)}
        />
      ) : null}

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
