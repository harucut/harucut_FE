"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { getFrameConfig } from "@/constants/frames";
import type { RemoteFrame } from "@/lib/api-types";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { frameIdFromFrameType } from "@/lib/frameApi";
import {
  listPickableFrameVersions,
  listWorkspaceFrames,
  publishFrameVersion,
  type EventLayout,
  type FrameRef,
  type PickableFrameVersion,
} from "@/lib/studio/studioApi";

export function layoutName(layout: EventLayout) {
  return getFrameConfig(frameIdFromFrameType(layout)).name;
}

/**
 * 고른 발행본 목록을 서버 규칙에 맞춘다 — 순서는 고른 순서, 기본은 전체에서 정확히 하나.
 * 기본이 없으면(첫 선택·기본을 뺀 경우) 남은 첫째를 기본으로 둔다. 게시 검사가 「기본 프레임은
 * 정확히 하나」를 요구해서, 운영자가 따로 누르지 않아도 맞게 둔다.
 */
export function normalizeFrameRefs(refs: FrameRef[]): FrameRef[] {
  const hasDefault = refs.some((r) => r.isDefault);
  let seenDefault = false;
  return refs.map((ref, index) => {
    const isDefault = hasDefault ? ref.isDefault && !seenDefault : index === 0;
    if (isDefault) seenDefault = true;
    return { ...ref, isDefault, sortOrder: index + 1 };
  });
}

type Catalog = { versions: PickableFrameVersion[]; frames: RemoteFrame[] };

export function StudioFramePicker({
  workspaceId,
  layouts,
  value,
  onChange,
  disabled,
  editLocked,
  onEditFrame,
  onCreateFrame,
}: {
  workspaceId: string;
  /** 허용 레이아웃. 여기 없는 판형의 발행본은 고를 수 없다(게시 검사와 같다). */
  layouts: EventLayout[];
  value: FrameRef[];
  onChange: (next: FrameRef[]) => void;
  disabled?: boolean;
  /** 저장 안 한 설정이 있으면 편집기로 떠나지 않는다 — 돌아오면 그 설정이 사라진다. */
  editLocked?: boolean;
  /** 둘 다 없으면 고르기만 한다 — 공간·프로젝트 기본값처럼 편집기로 떠날 수 없는 자리. 「공간 프레임」 관리 칸을 그리지 않는다. */
  onEditFrame?: (frame: RemoteFrame) => void;
  onCreateFrame?: (layout: EventLayout) => void;
}) {
  const radioName = useId();
  const manage = Boolean(onEditFrame && onCreateFrame);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [versions, frames] = await Promise.all([
        listPickableFrameVersions(workspaceId),
        listWorkspaceFrames(workspaceId),
      ]);
      setCatalog({ versions, frames });
      setError(null);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "프레임 목록을 불러오지 못했어요."));
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  const selectedIds = new Set(value.map((r) => r.frameVersionId));
  const known = new Set(catalog?.versions.map((v) => v.frameVersionId) ?? []);
  const unknownRefs = catalog ? value.filter((r) => !known.has(r.frameVersionId)) : [];
  const latestByFrame = new Map(catalog?.versions.map((v) => [v.frameId, v]) ?? []);

  const toggle = (version: PickableFrameVersion, on: boolean) => {
    const next = on
      ? [...value, { frameVersionId: version.frameVersionId, layoutType: version.frameType, isDefault: false, sortOrder: 0 }]
      : value.filter((r) => r.frameVersionId !== version.frameVersionId);
    onChange(normalizeFrameRefs(next));
  };

  const makeDefault = (frameVersionId: number) =>
    onChange(normalizeFrameRefs(value.map((r) => ({ ...r, isDefault: r.frameVersionId === frameVersionId }))));

  const publish = async (frame: RemoteFrame) => {
    setPublishing(frame.frameId);
    setNotice(null);
    try {
      const published = await publishFrameVersion(frame.frameId);
      setNotice(`「${frame.title}」 ${published.versionNo}번째 발행본을 만들었어요. 아래에서 골라 저장해야 행사에 쓰여요.`);
      await load();
    } catch (cause) {
      setNotice(
        getUserFacingApiErrorMessage(
          cause,
          "발행하지 못했어요. 편집기에서 프레임을 한 번 다시 저장한 뒤 발행해 주세요.",
        ),
      );
    } finally {
      setPublishing(null);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {error}
        </p>
        <button type="button" onClick={() => void load()} className="hc-button-secondary h-11 self-start rounded-full px-4 text-[13px] font-semibold">
          다시 불러오기
        </button>
      </div>
    );
  }
  if (!catalog) return <p className="text-[13px] text-(--hc-muted)">프레임 목록을 불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-5">
      {layouts.length === 0 ? (
        <p className="text-[13px] text-(--hc-muted)">허용 레이아웃을 먼저 고르면 그 판형의 프레임을 고를 수 있어요.</p>
      ) : null}

      {layouts.map((layout) => {
        const candidates = catalog.versions.filter((v) => v.frameType === layout);
        return (
          <fieldset key={layout} disabled={disabled} className="flex flex-col gap-2">
            <legend className="mb-1 text-[14px] font-semibold">{layoutName(layout)}</legend>
            {candidates.length === 0 ? (
              <p className="text-[13px] text-(--hc-muted)">
                {manage
                  ? "고를 수 있는 발행본이 없어요. 아래 「공간 프레임」에서 만들고 발행해 주세요."
                  : "고를 수 있는 발행본이 없어요. 행사 화면의 「공간 프레임」에서 만들고 발행해 주세요."}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {candidates.map((version) => {
                  const checked = selectedIds.has(version.frameVersionId);
                  const ref = value.find((r) => r.frameVersionId === version.frameVersionId);
                  return (
                    <li key={version.frameVersionId} className="hc-surface-well flex items-center gap-3 rounded-2xl p-2">
                      {version.previewUrl ? (
                        // 서명 URL 이라 next/image 최적화를 거치지 않는다.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={version.previewUrl} alt="" className="h-16 w-12 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span aria-hidden className="h-16 w-12 shrink-0 rounded-md bg-(--hc-border)" />
                      )}
                      <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-[14px]">
                        <input
                          type="checkbox"
                          className="size-5 shrink-0"
                          checked={checked}
                          onChange={(e) => toggle(version, e.target.checked)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{version.title || "이름 없는 프레임"}</span>
                          <span className="block text-[12px] text-(--hc-muted)">
                            {version.source === "SYSTEM" ? "기본 제공" : "우리 공간"} · {version.versionNo}번째 발행본
                          </span>
                        </span>
                      </label>
                      {checked ? (
                        <label className="flex min-h-11 shrink-0 items-center gap-1.5 text-[13px]">
                          <input
                            type="radio"
                            name={radioName}
                            className="size-4"
                            checked={Boolean(ref?.isDefault)}
                            onChange={() => makeDefault(version.frameVersionId)}
                          />
                          기본
                        </label>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        );
      })}

      {unknownRefs.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-(--hc-border) p-3 text-[13px]">
          <p>
            지금 목록에 없는 발행본이 연결돼 있어요. 더 새 발행본이 나왔거나 원본 프레임이 지워졌을 수
            있어요. 위에서 다시 고른 뒤 빼 주세요.
          </p>
          <ul className="flex flex-col gap-1">
            {unknownRefs.map((ref) => (
              <li key={ref.frameVersionId} className="flex items-center justify-between gap-2">
                <span>
                  {layoutName(ref.layoutType)} · 발행본 #{ref.frameVersionId}
                  {ref.isDefault ? " · 기본" : ""}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  className="h-11 rounded-full px-3 text-(--hc-danger)"
                  onClick={() => onChange(normalizeFrameRefs(value.filter((r) => r.frameVersionId !== ref.frameVersionId)))}
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {manage ? (
        <section aria-labelledby="studio-workspace-frames" className="flex flex-col gap-2">
          <h3 id="studio-workspace-frames" className="text-[14px] font-semibold">
            공간 프레임
          </h3>
          <p className="text-[12px] text-(--hc-muted)">
            고친 프레임은 「새 버전 발행」을 눌러야 고를 수 있어요. 이미 게시한 행사는 고른 발행본을 그대로 써요.
          </p>
          {editLocked ? (
            <p className="text-[12px] text-(--hc-muted)">바꾼 설정을 저장한 뒤 프레임을 만들거나 고칠 수 있어요.</p>
          ) : null}
          {notice ? (
            <p role="status" className="text-[13px]">
              {notice}
            </p>
          ) : null}
          {catalog.frames.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {catalog.frames.map((frame) => {
                const latest = latestByFrame.get(frame.frameId);
                return (
                  <li key={frame.frameId} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{frame.title || "이름 없는 프레임"}</span>
                      <span className="block text-[12px] text-(--hc-muted)">
                        {layoutName(frame.frameType)} · {latest ? `${latest.versionNo}번째까지 발행` : "아직 발행 안 함"}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        disabled={editLocked}
                        onClick={() => onEditFrame?.(frame)}
                        className="h-11 rounded-full border border-(--hc-border) px-3 text-[13px] font-semibold disabled:opacity-50"
                      >
                        고치기
                      </button>
                      <button
                        type="button"
                        disabled={publishing !== null}
                        onClick={() => void publish(frame)}
                        className="h-11 rounded-full border border-(--hc-border) px-3 text-[13px] font-semibold disabled:opacity-50"
                      >
                        {publishing === frame.frameId ? "발행하는 중…" : latest ? "새 버전 발행" : "발행하기"}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-(--hc-muted)">아직 이 공간에 만든 프레임이 없어요.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {(layouts.length > 0 ? layouts : (["CLASSIC", "WIDE", "GRID", "POLAROID"] as EventLayout[])).map((layout) => (
              <button
                key={layout}
                type="button"
                disabled={editLocked}
                onClick={() => onCreateFrame?.(layout)}
                className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
              >
                {layoutName(layout)} 만들기
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
