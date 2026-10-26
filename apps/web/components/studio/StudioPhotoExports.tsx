"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  MAX_EXPORT_PHOTOS,
  createPhotoExport,
  getPhotoExportDownload,
  listPhotoExports,
  type ExportStatus,
  type PhotoChannel,
  type PhotoExport,
} from "@/lib/studio/photosApi";

export const STATUS_LABEL: Record<ExportStatus, string> = {
  PENDING: "기다리는 중",
  RUNNING: "묶는 중",
  DONE: "받을 수 있어요",
  FAILED: "만들지 못했어요",
  EXPIRED: "기간이 지났어요",
};

/** 만드는 중인 묶음이 있을 때 다시 묻는 간격. 압축은 서버 작업이 맡고 이 화면은 상태만 본다. */
export const EXPORT_POLL_MS = 5_000;

export function formatSize(bytes?: number | null) {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function openWithoutReferrer(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * 사진 묶음 다운로드(R5 8절, ADR-0008 §4). 요청 하나가 긴 압축을 맡지 않는다 — 만들기를 누르면 서버가 접수하고,
 * 이 화면은 상태를 다시 물어 다 되면 받는다. 받을 때마다 서버가 권한과 담긴 사진을 다시 본다.
 */
export function StudioPhotoExports({
  eventId,
  selectedIds,
  channel,
  onCreated,
}: {
  eventId: string;
  /** 고른 사진. 비어 있으면 「전체」만 할 수 있다. */
  selectedIds: number[];
  /** 지금 사진함 필터의 참가 방식 — 「전체 묶어 받기」에 그대로 쓴다. */
  channel?: PhotoChannel;
  onCreated: () => void;
}) {
  const [exports, setExports] = useState<PhotoExport[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 목록 요청의 세대. 새 요청과 묶음 만들기가 올린다 — 그 전에 시작한 목록 응답이 방금 만든 묶음을 지우지 않게(Codex #543).
  const listGenerationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++listGenerationRef.current;
    try {
      const list = await listPhotoExports(eventId);
      if (generation !== listGenerationRef.current) return;
      setExports(list);
      setLoadError(null);
    } catch (cause) {
      if (generation !== listGenerationRef.current) return;
      // 실패를 빈 목록으로 바꾸면 있던 묶음이 없는 것처럼 보인다. 있던 목록은 두고 실패를 알린다.
      setLoadError(getUserFacingApiErrorMessage(cause, "묶음 목록을 불러오지 못했어요."));
    }
  }, [eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  const working = (exports ?? []).some((e) => e.status === "PENDING" || e.status === "RUNNING");
  // 앞 조회가 끝난 뒤에 다음 조회를 예약한다. 고정 간격으로 쏘면 조회가 간격보다 오래 걸릴 때 매번 새 요청이
  // 앞 응답을 세대 검사로 버리게 해 다 된 묶음이 영영 안 보인다(Codex #543).
  useEffect(() => {
    if (!working) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      await load();
      if (!cancelled) timer = window.setTimeout(() => void tick(), EXPORT_POLL_MS);
    };
    timer = window.setTimeout(() => void tick(), EXPORT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [working, load]);

  const create = async (target: Parameters<typeof createPhotoExport>[1], key: string) => {
    setBusy(key);
    setNotice(null);
    try {
      const created = await createPhotoExport(eventId, target);
      listGenerationRef.current += 1;
      setExports((prev) => [created, ...(prev ?? []).filter((e) => e.exportId !== created.exportId)]);
      setNotice(`${created.photoCount}장을 묶고 있어요. 다 되면 아래에서 받을 수 있어요.`);
      onCreated();
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, "묶음을 만들지 못했어요."));
    } finally {
      setBusy(null);
    }
  };

  const download = async (item: PhotoExport) => {
    setBusy(item.exportId);
    setNotice(null);
    try {
      const { url } = await getPhotoExportDownload(eventId, item.exportId);
      openWithoutReferrer(url);
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, "묶음을 받지 못했어요."));
      // 만료 · 무효(담긴 사진이 지워짐 등)는 서버가 그 자리에서 상태를 바꾼다 — 목록을 맞춘다.
      if (getApiErrorDetails(cause).code === "EXPORT-002") void load();
    } finally {
      setBusy(null);
    }
  };

  const tooMany = selectedIds.length > MAX_EXPORT_PHOTOS;

  return (
    <section aria-labelledby="studio-exports-title" className="flex flex-col gap-3">
      <h2 id="studio-exports-title" className="text-[18px] font-bold">
        한꺼번에 받기
      </h2>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null || selectedIds.length === 0 || tooMany}
          onClick={() => void create({ photoIds: selectedIds }, "selected")}
          className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          고른 사진 묶어 받기 ({selectedIds.length})
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void create({ filter: channel ? { channel } : {} }, "all")}
          className="h-11 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          {channel ? "이 참가 방식 전체 묶어 받기" : "완성된 사진 전체 묶어 받기"}
        </button>
      </div>
      <p className="text-[12px] text-(--hc-muted)">
        한 번에 {MAX_EXPORT_PHOTOS.toLocaleString("ko-KR")}장까지 묶어요. 다 된 묶음은 24시간 동안 받을 수 있어요.
      </p>
      {tooMany ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {MAX_EXPORT_PHOTOS.toLocaleString("ko-KR")}장까지만 고를 수 있어요.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-[13px]">
          {notice}
        </p>
      ) : null}
      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-(--hc-danger)">
          {loadError}
          <button
            type="button"
            onClick={() => void load()}
            className="h-11 rounded-full border border-(--hc-border) px-4 font-semibold text-(--hc-text)"
          >
            목록 다시 불러오기
          </button>
        </div>
      ) : null}

      {exports && exports.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {exports.map((item) => (
            <li key={item.exportId} className="hc-surface-well flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2 text-[13px]">
              <span>
                {item.photoCount}장 · {STATUS_LABEL[item.status]}
                {item.status === "DONE" && item.sizeBytes ? ` · ${formatSize(item.sizeBytes)}` : ""}
              </span>
              {item.status === "DONE" ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void download(item)}
                  className="hc-button-primary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
                >
                  받기
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
