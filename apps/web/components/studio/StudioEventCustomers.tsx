"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
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

function formatPhotosFrom(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * 행사 고객(ADR-0008 §2-2) — 신랑신부처럼 이 행사 사진만 보는 사람. 공간 멤버가 아니라서 공간의 다른 행사는
 * 모른다. 권한은 사진 보기·내려받기·한꺼번에 받기·지우기로 나뉘고, 행사 설정은 고객이 바꾸지 못한다.
 *
 * 새로 받는 사람은 기본으로 수락한 뒤에 찍은 사진만 본다. 사람을 더한다고 과거 사진 열람 범위가 저절로 넓어지면
 * 안 된다. 행사가 끝난 뒤 초대하면 볼 사진이 없으므로, 그때 쓰는 체크를 바로 옆에 둔다.
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
  const [includePast, setIncludePast] = useState(false);
  const [issued, setIssued] = useState<{ link: string; includePast: boolean } | null>(null);
  const [confirm, setConfirm] = useState<EventGrant | null>(null);
  const [widenTarget, setWidenTarget] = useState<EventGrant | null>(null);

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
      // 내 사진 범위를 넘는 권한을 주면 서버가 막는다. 「권한이 없어요」로는 왜 막혔는지 모른다.
      setNotice(
        getApiErrorDetails(cause).code === "GEN-021"
          ? "처리할 수 없어요. 내가 볼 수 있는 사진 범위를 넘거나 내 권한이 바뀌었을 수 있어요."
          : getUserFacingApiErrorMessage(cause, fallback),
      );
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
              {grant.photosFrom ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-(--hc-muted)">
                  <span>{formatPhotosFrom(grant.photosFrom) ?? "받은 시각"} 뒤에 찍은 사진만 봐요.</span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setWidenTarget(grant)}
                    className="h-11 rounded-full px-3 text-[13px] font-semibold text-(--hc-text) disabled:opacity-50"
                  >
                    이전 사진도 보이게
                  </button>
                </div>
              ) : null}
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
        <label className="flex min-h-11 items-start gap-2 py-2 text-[13px]">
          <input
            type="checkbox"
            name="customerIncludePast"
            className="size-5 shrink-0"
            checked={includePast}
            onChange={(e) => setIncludePast(e.target.checked)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">이미 찍은 사진도 보여 주기</span>
            <span className="max-w-[60ch] text-[12px] leading-relaxed text-(--hc-muted)">
              끄면 초대를 받은 뒤에 찍은 사진만 보여요. 행사가 끝난 뒤 초대한다면 켜 주세요. 켠 사실은 활동 기록에 남아요.
            </span>
          </span>
        </label>
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
                const result = await inviteEventCustomer(eventId, permissions, note.trim() || undefined, includePast);
                setIssued({ link: inviteLink(window.location.origin, result.inviteToken), includePast });
                setNote("");
                setIncludePast(false);
              },
              "초대 링크를 만들지 못했어요.",
            )
          }
          className="hc-button-secondary h-11 self-start rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          {busy === "invite" ? "만드는 중…" : "고객 초대 링크 만들기"}
        </button>
        {issued ? (
          <div className="hc-surface-well flex flex-col gap-2 rounded-2xl p-3 text-[13px]">
            <p>
              이 링크는 지금 한 번만 보여요. 7일 동안 한 사람이 한 번 쓸 수 있어요. 받은 분은 이 행사 사진만 보고,{" "}
              {issued.includePast ? "이미 찍은 사진도 볼 수 있어요." : "받은 뒤에 찍은 사진만 볼 수 있어요."}
            </p>
            <p className="break-all font-mono text-[12px]">{issued.link}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issued.link);
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

      {widenTarget ? (
        <ConfirmDialog
          title={`${widenTarget.name}님에게 이전 사진도 보여 줄까요?`}
          description="이미 찍은 사진까지 모두 볼 수 있어요. 담당자가 바뀐 경우처럼 볼 이유가 있을 때만 켜 주세요. 활동 기록에 남아요."
          confirmLabel="이전 사진도 보이게"
          runningLabel="처리하는 중…"
          running={busy === String(widenTarget.grantId)}
          onClose={() => setWidenTarget(null)}
          onConfirm={async () => {
            const grant = widenTarget;
            await run(
              String(grant.grantId),
              async () => {
                const saved = await updateEventGrant(eventId, grant.grantId, grant.permissions, true);
                setGrants((prev) => prev?.map((g) => (g.grantId === saved.grantId ? saved : g)) ?? null);
              },
              "사진 범위를 바꾸지 못했어요.",
            );
            setWidenTarget(null);
          }}
        />
      ) : null}

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
