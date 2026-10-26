"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  EVENT_PERMISSIONS,
  PERMISSION_LABEL,
  inviteEventCustomer,
  inviteLink,
  listEventGrants,
  removeEventGrant,
  updateEventGrant,
  type EventGrant,
  type EventPermission,
} from "@/lib/studio/accessApi";

/** 고객에게 처음 줄 권한. 보기·내려받기 — 지우기와 한꺼번에 받기는 운영자가 골라서 준다. */
const DEFAULT_PERMISSIONS: EventPermission[] = ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS"];

/**
 * 행사 고객(ADR-0008 §2-2) — 신랑신부처럼 이 행사 사진만 보는 사람. 공간 멤버가 아니라서 공간의 다른 행사는
 * 모른다. 권한은 사진 보기·내려받기·한꺼번에 받기·지우기로 나뉘고, 행사 설정은 고객이 바꾸지 못한다.
 */
export function StudioEventCustomers({
  eventId,
  onRemoved,
}: {
  eventId: string;
  /** 권한 행을 지운 뒤. 운영자 배정도 같은 행을 보므로 다시 받게 한다(행을 지우면 운영 권한도 함께 사라진다). */
  onRemoved?: () => void;
}) {
  const [grants, setGrants] = useState<EventGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<EventPermission[]>(DEFAULT_PERMISSIONS);
  const [note, setNote] = useState("");
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<EventGrant | null>(null);

  const load = useCallback(async () => {
    try {
      setGrants(await listEventGrants(eventId));
      setError(null);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "행사 고객을 불러오지 못했어요."));
    }
  }, [eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  const run = async (key: string, task: () => Promise<void>, fallback: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await task();
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, fallback));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (list: EventPermission[], p: EventPermission, on: boolean) =>
    EVENT_PERMISSIONS.filter((x) => (x === p ? on : list.includes(x)));

  if (error) {
    return (
      <p role="alert" className="text-[13px] text-(--hc-danger)">
        {error}
      </p>
    );
  }
  if (!grants) return <p className="text-[13px] text-(--hc-muted)">행사 고객을 불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <p role="status" className="text-[13px]">
          {notice}
        </p>
      ) : null}

      {grants.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {grants.map((grant) => (
            <li key={grant.grantId} className="hc-surface-well flex flex-col gap-2 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px] font-semibold">{grant.name}</span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setConfirm(grant)}
                  className="h-11 rounded-full px-3 text-[13px] text-(--hc-danger) disabled:opacity-50"
                >
                  권한 회수
                </button>
              </div>
              <fieldset className="flex flex-wrap gap-x-4" disabled={busy !== null}>
                <legend className="sr-only">{grant.name} 권한</legend>
                {EVENT_PERMISSIONS.map((p) => (
                  <label key={p} className="flex min-h-11 items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={grant.permissions.includes(p)}
                      onChange={(e) => {
                        const next = toggle(grant.permissions, p, e.target.checked);
                        // 하나도 없으면 권한 회수와 같다 — 그 길은 「권한 회수」로만 둔다.
                        if (next.length === 0) return;
                        void run(
                          String(grant.grantId),
                          async () => {
                            const saved = await updateEventGrant(eventId, grant.grantId, next);
                            setGrants((prev) => prev?.map((g) => (g.grantId === saved.grantId ? saved : g)) ?? null);
                          },
                          "권한을 바꾸지 못했어요.",
                        );
                      }}
                    />
                    {PERMISSION_LABEL[p]}
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-(--hc-muted)">아직 사진 권한을 받은 사람이 없어요.</p>
      )}

      <div className="flex flex-col gap-2">
        <fieldset className="flex flex-wrap gap-x-4">
          <legend className="mb-1 text-[13px] font-semibold">초대할 분의 권한</legend>
          {EVENT_PERMISSIONS.map((p) => (
            <label key={p} className="flex min-h-11 items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-5"
                checked={permissions.includes(p)}
                onChange={(e) => setPermissions(toggle(permissions, p, e.target.checked))}
              />
              {PERMISSION_LABEL[p]}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="studio-customer-note" className="text-[13px] font-semibold">
            메모 (선택)
          </label>
          <input
            id="studio-customer-note"
            className="hc-input h-11 rounded-xl border px-3 text-[14px]"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 신랑 측"
          />
        </div>
        <button
          type="button"
          disabled={busy !== null || permissions.length === 0}
          onClick={() =>
            void run(
              "invite",
              async () => {
                const issued = await inviteEventCustomer(eventId, permissions, note.trim() || undefined);
                setIssuedLink(inviteLink(window.location.origin, issued.inviteToken));
                setNote("");
              },
              "초대 링크를 만들지 못했어요.",
            )
          }
          className="hc-button-secondary h-11 self-start rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          {busy === "invite" ? "만드는 중…" : "고객 초대 링크 만들기"}
        </button>
        {issuedLink ? (
          <div className="hc-surface-well flex flex-col gap-2 rounded-2xl p-3 text-[13px]">
            <p>이 링크는 지금 한 번만 보여요. 7일 동안 한 사람이 한 번 쓸 수 있어요. 받은 분은 이 행사 사진만 봐요.</p>
            <p className="break-all font-mono text-[12px]">{issuedLink}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issuedLink);
                  setNotice("링크를 복사했어요. 초대할 분께 직접 보내 주세요.");
                } catch {
                  setNotice("복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.");
                }
              }}
              className="hc-button-primary h-11 self-start rounded-full px-4 text-[13px] font-semibold"
            >
              링크 복사
            </button>
          </div>
        ) : null}
      </div>

      {confirm ? (
        <ConfirmDialog
          title={`${confirm.name}님의 사진 권한을 회수할까요?`}
          description={
            confirm.operations?.length
              ? "이 행사 사진을 더 보거나 내려받을 수 없고, 이 행사의 운영 권한도 함께 빠져요."
              : "이 행사 사진을 더 보거나 내려받을 수 없어요. 다시 주려면 새로 초대해야 해요."
          }
          confirmLabel="권한 회수"
          runningLabel="처리하는 중…"
          running={busy === String(confirm.grantId)}
          destructive
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const grant = confirm;
            await run(
              String(grant.grantId),
              async () => {
                await removeEventGrant(eventId, grant.grantId);
                setGrants((prev) => prev?.filter((g) => g.grantId !== grant.grantId) ?? null);
                onRemoved?.();
              },
              "권한을 회수하지 못했어요.",
            );
            setConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}
