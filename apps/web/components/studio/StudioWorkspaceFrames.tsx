"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FrameWithPhotos, frameFitStyle } from "@/components/participation/FrameWithPhotos";
import { FrameVersionManager } from "@/components/studio/FrameVersionManager";
import { DEMO_PHOTOS } from "@/constants/demoPhotos";
import { getFrameConfig } from "@/constants/frames";
import type { RemoteFrame } from "@/lib/api-types";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { frameIdFromFrameType } from "@/lib/frameApi";
import {
  listFrameVersions,
  restoreFrameVersion,
  revokeFrameVersion,
  listPickableFrameVersions,
  listWorkspaceFrames,
  publishFrameVersion,
  type EventLayout,
  type PickableFrameVersion,
} from "@/lib/studio/studioApi";
import { useThemeSession } from "@/lib/themeSessionStore";

export function layoutName(layout: EventLayout) {
  return getFrameConfig(frameIdFromFrameType(layout)).name;
}

const ALL_LAYOUTS: EventLayout[] = ["CLASSIC", "WIDE", "GRID", "POLAROID"];

/**
 * 공간 프레임 목록과 고치기·발행·새로 만들기. 행사 설정의 프레임 칸과 Studio 홈이 같은 것을 쓴다.
 * `readOnly` 는 보기 전용 멤버다 — 서버도 고치기·발행을 OWNER·ADMIN·DESIGNER 에게만 연다.
 */
export function WorkspaceFrameList({
  frames,
  versions,
  layouts = ALL_LAYOUTS,
  editLocked,
  readOnly,
  onEditFrame,
  onCreateFrame,
  onPublished,
}: {
  frames: RemoteFrame[];
  versions: PickableFrameVersion[];
  layouts?: EventLayout[];
  editLocked?: boolean;
  readOnly?: boolean;
  onEditFrame?: (frame: RemoteFrame) => void;
  onCreateFrame?: (layout: EventLayout) => void;
  /** 발행이 끝났다. 부모가 목록을 다시 받는다. */
  onPublished: () => Promise<void> | void;
}) {
  const [publishing, setPublishing] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const latestByFrame = new Map(versions.map((v) => [v.frameId, v]));

  const publish = async (frame: RemoteFrame) => {
    setPublishing(frame.frameId);
    setNotice(null);
    try {
      const published = await publishFrameVersion(frame.frameId);
      setNotice(`「${frame.title}」 ${published.versionNo}번째 발행본을 만들었어요. 행사 설정에서 고르고 저장해야 행사에 쓰여요.`);
      await onPublished();
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

  return (
    <div className="flex flex-col gap-2">
      {notice ? (
        <p role="status" className="text-[13px]">
          {notice}
        </p>
      ) : null}
      {frames.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {frames.map((frame) => {
            const latest = latestByFrame.get(frame.frameId);
            return (
              <li key={frame.frameId} className="flex flex-wrap items-center justify-between gap-3 text-[14px]">
                <span className="flex min-w-0 items-center gap-3">
                  {/* 이름만으로는 어느 프레임인지 모른다. 행사에 고를 때와 같은 모습으로 보여 준다. */}
                  <span aria-hidden className="flex h-20 w-14 shrink-0 items-center justify-center [container-type:size]">
                    {frame.source ? (
                      <FrameWithPhotos
                        frame={{ layoutType: frame.frameType, previewUrl: frame.source }}
                        photos={DEMO_PHOTOS}
                        loading="lazy"
                        className="rounded-[3px]"
                        style={frameFitStyle(frame.frameType)}
                      />
                    ) : (
                      <span className="block size-full rounded-md bg-(--hc-border)" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{frame.title || "이름 없는 프레임"}</span>
                    <span className="block text-[12px] text-(--hc-muted)">
                      {layoutName(frame.frameType)} · {latest ? `${latest.versionNo}번째까지 발행` : "고를 수 있는 발행본 없음"}
                    </span>
                  </span>
                </span>
                {readOnly ? null : (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      disabled={editLocked}
                      onClick={() => onEditFrame?.(frame)}
                      className="h-11 rounded-full border border-(--hc-border) px-3 text-[13px] font-semibold transition hover:border-(--hc-border-strong) disabled:opacity-50"
                    >
                      고치기
                    </button>
                    <button
                      type="button"
                      disabled={publishing !== null}
                      onClick={() => void publish(frame)}
                      className="h-11 rounded-full border border-(--hc-border) px-3 text-[13px] font-semibold transition hover:border-(--hc-border-strong) disabled:opacity-50"
                    >
                      {publishing === frame.frameId ? "발행하는 중…" : latest ? "새 버전 발행" : "발행하기"}
                    </button>
                  </span>
                )}
                {/* 보기 전용 멤버는 회수하지 못한다. 고를 수 있는 발행본이 없어도 둔다 — 전부 회수한 프레임을 되돌리는 길이 여기뿐이다. */}
                {readOnly ? null : (
                  <FrameVersionManager
                    load={() => listFrameVersions(frame.frameId)}
                    revoke={(version, reason) => revokeFrameVersion(frame.frameId, version.versionNo, reason)}
                    restore={(version) => restoreFrameVersion(frame.frameId, version.versionNo)}
                    onChanged={onPublished}
                    revision={latest?.versionNo}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-(--hc-muted)">아직 이 공간에 만든 프레임이 없어요.</p>
      )}
      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          {(layouts.length > 0 ? layouts : ALL_LAYOUTS).map((layout) => (
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
      )}
    </div>
  );
}

/**
 * Studio 홈의 공간 프레임 칸. 디자이너의 작업 자리다 — 행사 목록을 볼 수 없는 역할이라, 프레임 입구가 행사 화면 안에만
 * 있으면 초대받고도 할 일을 찾지 못한다(R5 9절). 편집기에서 돌아오면 이 공간의 Studio 홈으로 온다.
 */
export function StudioWorkspaceFrames({ workspaceId, readOnly }: { workspaceId: string; readOnly?: boolean }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<{ frames: RemoteFrame[]; versions: PickableFrameVersion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [frames, versions] = await Promise.all([
        listWorkspaceFrames(workspaceId),
        listPickableFrameVersions(workspaceId),
      ]);
      setCatalog({ frames, versions });
      setError(null);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "프레임 목록을 불러오지 못했어요."));
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  const openEditor = (layout: EventLayout, remoteFrameId: number | null) => {
    const session = useThemeSession.getState();
    session.setFrameId(frameIdFromFrameType(layout));
    session.setRemoteFrameId(remoteFrameId);
    session.setWorkspaceContext(workspaceId, `/studio?workspace=${encodeURIComponent(workspaceId)}`);
    router.push("/theme/sticker");
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
  if (!catalog) {
    return (
      <p role="status" className="text-[14px] text-(--hc-muted)">
        프레임을 불러오는 중…
      </p>
    );
  }
  return (
    <WorkspaceFrameList
      frames={catalog.frames}
      versions={catalog.versions}
      readOnly={readOnly}
      onEditFrame={(frame) => openEditor(frame.frameType, frame.frameId)}
      onCreateFrame={(layout) => openEditor(layout, null)}
      onPublished={load}
    />
  );
}
