"use client";

import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, formatDateTime } from "@/components/admin/adminShared";
import { FrameVersionManager } from "@/components/studio/FrameVersionManager";
import { getFrameConfig } from "@/constants/frames";
import { frameIdFromFrameType } from "@/lib/frameApi";
import {
  listSystemFrames,
  listSystemFrameVersions,
  publishSystemFrame,
  restoreSystemFrameVersion,
  revokeSystemFrameVersion,
  type SystemFrame,
} from "@/lib/admin/cmsApi";
import { parseAssetTitle } from "@/lib/serverAssets";

/**
 * 시스템 프레임 발행. 시스템 기본 프레임은 프레임마다 한 번 발행해야 행사에서 고를 수 있다(docs/plan-implementation-status.md).
 * 만들고 고치는 일은 여기서 하지 않는다. `[배경]`·`[스티커]` 항목은 편집기 소재라 발행 대상이 아니다(docs/frame-assets.md).
 */
export function AdminFrames() {
  const [frames, setFrames] = useState<SystemFrame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notices, setNotices] = useState<Record<number, { kind: "ok" | "error"; text: string }>>({});

  const load = useCallback(async () => {
    try {
      setFrames(await listSystemFrames());
      setError(null);
    } catch (cause) {
      setError(adminErrorMessage(cause, "시스템 프레임을 불러오지 못했어요."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async (frame: SystemFrame) => {
    setBusy(frame.frameId);
    setNotices((prev) => {
      const next = { ...prev };
      delete next[frame.frameId];
      return next;
    });
    try {
      const { versionNo } = await publishSystemFrame(frame.frameId);
      setNotices((prev) => ({ ...prev, [frame.frameId]: { kind: "ok", text: `${versionNo}번째 발행본을 만들었어요.` } }));
    } catch (cause) {
      setNotices((prev) => ({
        ...prev,
        [frame.frameId]: { kind: "error", text: adminErrorMessage(cause, "발행하지 못했어요. 프레임을 확인해 주세요.") },
      }));
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-[14px] text-(--hc-danger)">
          {error}
        </p>
        <button type="button" onClick={() => void load()} className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold">
          다시 시도
        </button>
      </div>
    );
  }
  if (!frames) {
    return (
      <p role="status" className="text-[14px] text-(--hc-muted)">
        시스템 프레임을 불러오는 중…
      </p>
    );
  }

  const publishable = frames.filter((frame) => parseAssetTitle(frame.title) === null);
  const assetCount = frames.length - publishable.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[65ch] text-[13px] leading-relaxed text-(--hc-muted)">
        발행해야 행사 설정의 프레임 목록에 나타나요. 고친 뒤에는 새로 발행해 주세요. 이미 게시한 행사는 고른 발행본을 그대로 써요.
      </p>
      {publishable.length === 0 ? <p className="text-[14px] text-(--hc-muted)">발행할 시스템 프레임이 없어요.</p> : null}
      <ul className="flex flex-col divide-y divide-(--hc-border)">
        {publishable.map((frame) => {
          const notice = notices[frame.frameId];
          return (
            <li key={frame.frameId} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-[14px] font-semibold">{frame.title?.trim() || "이름 없는 프레임"}</p>
                  <p className="text-[12px] text-(--hc-muted)">
                    {getFrameConfig(frameIdFromFrameType(frame.frameType)).name}
                    {frame.updatedAt ? ` · ${formatDateTime(frame.updatedAt)} 수정` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void publish(frame)}
                  className="h-11 shrink-0 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold transition hover:border-(--hc-border-strong) disabled:opacity-50"
                >
                  {busy === frame.frameId ? "발행하는 중…" : "발행"}
                </button>
              </div>
              <FrameVersionManager
                load={() => listSystemFrameVersions(frame.frameId)}
                revoke={(version, reason) => revokeSystemFrameVersion(version.frameVersionId, reason)}
                restore={(version) => restoreSystemFrameVersion(version.frameVersionId)}
              />
              {notice ? (
                <p role={notice.kind === "ok" ? "status" : "alert"} className={notice.kind === "ok" ? "text-[13px]" : "text-[13px] text-(--hc-danger)"}>
                  {notice.text}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {assetCount > 0 ? (
        <p className="text-[12px] text-(--hc-muted)">배경·스티커 소재 {assetCount}개는 발행 대상이 아니라 빼고 보여 줘요.</p>
      ) : null}
    </div>
  );
}
