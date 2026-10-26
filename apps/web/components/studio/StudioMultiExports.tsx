"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EXPORT_POLL_MS, STATUS_LABEL, formatSize, openWithoutReferrer } from "@/components/studio/StudioPhotoExports";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  MAX_EXPORT_PHOTOS,
  blockedExportEventIds,
  createMultiExport,
  getMultiExportDownload,
  listMultiExports,
  type MultiExportScope,
  type MultiPhotoExport,
} from "@/lib/studio/photosApi";
import { listProjects, type Project } from "@/lib/studio/projectsApi";
import type { StudioEvent } from "@/lib/studio/studioApi";

/** 「공간 전체」는 빈 문자열, 프로젝트는 그 id. */
type ScopeKey = string;

function scopeOf(workspaceId: string, key: ScopeKey): MultiExportScope {
  return key ? { kind: "project", projectId: key } : { kind: "workspace", workspaceId };
}

/**
 * 여러 행사 사진 묶기(ADR-0009 §6, P3-5). 프로젝트나 공간 범위에서 행사를 골라 보이는 완성 사진 전부를 한 ZIP 으로 묶는다.
 * 흐름은 행사 묶음과 같다 — 만들기 → 상태를 다시 물음 → 받기. 권한 없는 행사는 서버가 조용히 빼지 않고 막으므로, 그 행사를 이름으로 알린다.
 */
export function StudioMultiExports({
  workspaceId,
  canUseWorkspace,
  events,
}: {
  workspaceId: string;
  /** 공간 범위는 OWNER·ADMIN 만. 운영 담당은 멤버인 프로젝트 범위만 쓴다. */
  canUseWorkspace: boolean;
  /** 이 공간에서 내가 보는 행사(운영 담당은 맡은 행사만). */
  events: StudioEvent[];
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [scopeKey, setScopeKey] = useState<ScopeKey | null>(canUseWorkspace ? "" : null);
  const [picked, setPicked] = useState<string[]>([]);
  const [exports, setExports] = useState<MultiPhotoExport[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 목록 요청의 세대 — 범위를 바꾸거나 묶음을 만든 뒤, 그 전에 시작한 목록 응답이 덮지 않게.
  const listGenerationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    listProjects(workspaceId)
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        // 공간 범위를 못 쓰면 첫 프로젝트로 시작한다.
        if (!canUseWorkspace) setScopeKey((prev) => prev ?? list[0]?.projectId ?? null);
      })
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, [workspaceId, canUseWorkspace]);

  const load = useCallback(async () => {
    if (scopeKey === null) return;
    const generation = ++listGenerationRef.current;
    try {
      const list = await listMultiExports(scopeOf(workspaceId, scopeKey));
      if (generation !== listGenerationRef.current) return;
      setExports(list);
      setLoadError(null);
    } catch (cause) {
      if (generation !== listGenerationRef.current) return;
      setLoadError(getUserFacingApiErrorMessage(cause, "묶음 목록을 불러오지 못했어요."));
    }
  }, [workspaceId, scopeKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 범위가 정해지면 원격 조회
    void load();
  }, [load]);

  const working = (exports ?? []).some((e) => e.status === "PENDING" || e.status === "RUNNING");
  // 앞 조회가 끝난 뒤에 다음 조회를 예약한다(행사 묶음과 같은 이유 — Codex #543).
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

  if (scopeKey === null) {
    // 운영 담당인데 멤버인 프로젝트가 없다 — 여러 행사 묶음은 프로젝트 범위에서만 쓸 수 있다.
    return projects === null ? null : (
      <p className="text-[13px] text-(--hc-muted)">맡은 프로젝트가 있어야 여러 행사 사진을 한 번에 묶을 수 있어요.</p>
    );
  }

  const candidates = scopeKey ? events.filter((e) => e.settings.projectId === scopeKey) : events;
  const nameOf = (eventId: string) =>
    events.find((e) => e.eventId === eventId)?.settings.name || eventId;

  const changeScope = (key: ScopeKey) => {
    listGenerationRef.current += 1;
    setScopeKey(key);
    setPicked([]);
    setExports(null);
    setNotice(null);
  };

  const create = async () => {
    setBusy("create");
    setNotice(null);
    try {
      const created = await createMultiExport(
        scopeOf(workspaceId, scopeKey),
        candidates.map((e) => e.eventId).filter((id) => picked.includes(id)),
      );
      listGenerationRef.current += 1;
      setExports((prev) => [created, ...(prev ?? []).filter((e) => e.exportId !== created.exportId)]);
      setPicked([]);
      setNotice({ kind: "ok", text: `${created.photoCount}장을 묶고 있어요. 다 되면 아래에서 받을 수 있어요.` });
    } catch (cause) {
      const base = getUserFacingApiErrorMessage(cause, "묶음을 만들지 못했어요.");
      const blocked = blockedExportEventIds(cause);
      setNotice({ kind: "error", text: blocked.length ? `${base} (${blocked.map(nameOf).join(", ")})` : base });
    } finally {
      setBusy(null);
    }
  };

  const download = async (item: MultiPhotoExport) => {
    setBusy(item.exportId);
    setNotice(null);
    try {
      const { url } = await getMultiExportDownload(scopeOf(workspaceId, scopeKey), item.exportId);
      openWithoutReferrer(url);
    } catch (cause) {
      const base = getUserFacingApiErrorMessage(cause, "묶음을 받지 못했어요.");
      const blocked = blockedExportEventIds(cause);
      setNotice({ kind: "error", text: blocked.length ? `${base} (${blocked.map(nameOf).join(", ")})` : base });
      if (getApiErrorDetails(cause).code === "EXPORT-002") void load();
    } finally {
      setBusy(null);
    }
  };

  const allPicked = candidates.length > 0 && candidates.every((e) => picked.includes(e.eventId));

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        범위
        <select
          value={scopeKey}
          onChange={(e) => changeScope(e.target.value)}
          className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
        >
          {canUseWorkspace ? <option value="">공간 전체</option> : null}
          {(projects ?? []).map((p) => (
            <option key={p.projectId} value={p.projectId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {candidates.length === 0 ? (
        <p className="text-[13px] text-(--hc-muted)">이 범위에 고를 행사가 없어요.</p>
      ) : (
        <fieldset className="flex flex-col gap-1" disabled={busy !== null}>
          <legend className="mb-1 text-[13px] font-semibold">담을 행사</legend>
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5"
              checked={allPicked}
              onChange={(e) => setPicked(e.target.checked ? candidates.map((ev) => ev.eventId) : [])}
            />
            모두 고르기
          </label>
          {candidates.map((event) => (
            <label key={event.eventId} className="flex min-h-11 items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                className="size-5"
                checked={picked.includes(event.eventId)}
                onChange={(e) =>
                  setPicked((prev) =>
                    e.target.checked ? [...prev, event.eventId] : prev.filter((id) => id !== event.eventId),
                  )
                }
              />
              {event.settings.name || "이름 없는 행사"}
            </label>
          ))}
        </fieldset>
      )}

      <button
        type="button"
        disabled={busy !== null || picked.length === 0}
        onClick={() => void create()}
        className="hc-button-secondary h-11 self-start rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
      >
        {busy === "create" ? "만드는 중…" : `고른 행사 사진 묶기 (${picked.length})`}
      </button>
      <p className="text-[12px] text-(--hc-muted)">
        고른 행사마다 보이는 완성 사진을 모두 담아요. 합쳐서 {MAX_EXPORT_PHOTOS.toLocaleString("ko-KR")}장까지,
        행사마다 폴더로 나뉘고, 다 된 묶음은 24시간 동안 받을 수 있어요. 사진 묶음 권한이 있는 행사만 담을 수 있어요.
      </p>

      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "error" ? "text-[13px] text-(--hc-danger)" : "text-[13px]"}
        >
          {notice.text}
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
            <li
              key={item.exportId}
              className="hc-surface-well flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2 text-[13px]"
            >
              <span className="min-w-0">
                {item.photoCount}장 · {STATUS_LABEL[item.status]}
                {item.status === "DONE" && item.sizeBytes ? ` · ${formatSize(item.sizeBytes)}` : ""}
                {item.events?.length ? (
                  <span className="block truncate text-[12px] text-(--hc-muted)">
                    {item.events.map((e) => `${e.name} ${e.photoCount}장`).join(" · ")}
                  </span>
                ) : null}
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
    </div>
  );
}
