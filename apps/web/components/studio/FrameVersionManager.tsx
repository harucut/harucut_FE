"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { SingleFieldDialog } from "@/components/ui/SingleFieldDialog";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";

export type ManagedFrameVersion = {
  frameVersionId: number;
  versionNo: number;
  /** 발행한 때. */
  createdAt?: string | null;
  revokedAt?: string | null;
  revokedReason?: string | null;
};

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" });
}

/**
 * 발행본 긴급 회수와 복구(R5 297줄). 저작권 문의처럼 바로 내려야 할 때 쓴다. 평소에 만질 일이 아니라 접어 둔다.
 * 회수해도 이미 만든 사진은 그대로고, 다른 프레임으로 몰래 바뀌지 않는다 — 고칠 사람이 알아야 하는 사실이라 화면에 적는다.
 */
export function FrameVersionManager({
  load,
  revoke,
  restore,
  onChanged,
  revision,
}: {
  load: () => Promise<ManagedFrameVersion[]>;
  revoke: (version: ManagedFrameVersion, reason: string) => Promise<unknown>;
  restore: (version: ManagedFrameVersion) => Promise<unknown>;
  /** 회수·복구 뒤. 고르기 목록을 다시 받게 한다. */
  onChanged?: () => Promise<void> | void;
  /** 새 발행본이 나오면 바뀐다. 펴 둔 목록을 다시 받는다. */
  revision?: number;
}) {
  // 프레임마다 하나씩 있다. 연 것만 내용을 그리고 불러온다.
  const [opened, setOpened] = useState(false);
  const [versions, setVersions] = useState<ManagedFrameVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [target, setTarget] = useState<ManagedFrameVersion | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // 부모가 그릴 때마다 새 함수를 준다. 이걸 의존성에 넣으면 조회가 끝나지 않는다.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  // 먼저 보낸 요청이 나중에 끝나도 새 목록을 덮지 않는다.
  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const next = await loadRef.current();
      if (request !== latestRequest.current) return;
      setVersions(next);
      setError(null);
    } catch (cause) {
      if (request !== latestRequest.current) return;
      setError(getUserFacingApiErrorMessage(cause, "발행본을 불러오지 못했어요."));
    }
  }, []);

  // 펼 때마다, 그리고 펴 둔 채 새 발행본이 나오면 받는다. 접혀 있는 동안 발행한 것을 놓치지 않는다.
  useEffect(() => {
    if (opened) void reload();
  }, [opened, revision, reload]);

  const submitRevoke = async (version: ManagedFrameVersion, reason: string) => {
    setBusy(version.frameVersionId);
    setDialogError(null);
    try {
      await revoke(version, reason);
      setTarget(null);
      await reload();
      await onChanged?.();
    } catch (cause) {
      setDialogError(getUserFacingApiErrorMessage(cause, "회수하지 못했어요. 잠시 뒤 다시 눌러 주세요."));
    } finally {
      setBusy(null);
    }
  };

  const submitRestore = async (version: ManagedFrameVersion) => {
    setBusy(version.frameVersionId);
    setError(null);
    try {
      await restore(version);
      await reload();
      await onChanged?.();
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "되돌리지 못했어요. 잠시 뒤 다시 눌러 주세요."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <details
      className="group w-full text-[13px]"
      onToggle={(event) => setOpened(event.currentTarget.open)}
    >
      <summary className="flex h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-(--hc-muted) transition hover:text-(--hc-text) [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
        발행본 회수
      </summary>
      {opened ? (
        <div className="flex flex-col gap-2 pb-2">
          <p className="max-w-[65ch] text-[12px] leading-relaxed text-(--hc-muted)">
            회수하면 고르는 목록과 참가 화면, 새 촬영에서 빠져요. 이미 만든 사진은 그대로고, 다른 프레임으로 저절로 바뀌지 않아요. 최신 발행본을 회수하면 이전 발행본으로 내려가지 않고 프레임이 목록에서 빠져요.
          </p>
          {error ? (
            <p role="alert" className="text-(--hc-danger)">
              {error}
            </p>
          ) : null}
          {versions === null && !error ? <p role="status">불러오는 중…</p> : null}
          {versions?.length === 0 ? <p className="text-(--hc-muted)">아직 발행본이 없어요.</p> : null}
          {versions && versions.length > 0 ? (
            <ul className="flex flex-col divide-y divide-(--hc-border)">
              {versions.map((version) => (
                <li key={version.frameVersionId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {version.versionNo}번째 발행본{version.revokedAt ? " · 회수됨" : ""}
                    </span>
                    <span className="block break-words text-[12px] text-(--hc-muted)">
                      {version.revokedAt
                        ? `${formatDate(version.revokedAt) ?? ""} ${version.revokedReason ?? ""}`.trim()
                        : formatDate(version.createdAt)}
                    </span>
                  </span>
                  {version.revokedAt ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void submitRestore(version)}
                      className="h-11 shrink-0 rounded-full border border-(--hc-border) px-3 text-[13px] font-semibold disabled:opacity-50"
                    >
                      {busy === version.frameVersionId ? "되돌리는 중…" : "되돌리기"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        setDialogError(null);
                        setTarget(version);
                      }}
                      className="h-11 shrink-0 rounded-full px-3 text-[13px] font-semibold text-(--hc-danger) disabled:opacity-50"
                    >
                      회수
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {/* 행사 설정 폼 안에서도 열린다. 폼이 겹치지 않게 body 로 내보낸다. */}
      {target
        ? createPortal(
            <SingleFieldDialog
              title={`${target.versionNo}번째 발행본을 회수할까요?`}
              description="이 프레임만 쓰는 행사는 새 촬영을 받지 못해요. 나중에 되돌릴 수 있어요."
              label="회수 이유"
              placeholder="예: 저작권 문의"
              initialValue=""
              maxLength={200}
              submitLabel="회수"
              submittingLabel="회수하는 중"
              destructive
              saving={busy === target.frameVersionId}
              error={dialogError}
              onClose={() => setTarget(null)}
              onSubmit={(reason) => void submitRevoke(target, reason)}
            />,
            document.body,
          )
        : null}
    </details>
  );
}
