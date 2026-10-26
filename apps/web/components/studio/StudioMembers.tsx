"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  ROLE_LABEL,
  changeMemberRole,
  inviteLink,
  inviteMember,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
  type Invitation,
  type Member,
} from "@/lib/studio/accessApi";
import type { WorkspaceRole } from "@/lib/studio/studioApi";

const ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "OPERATOR", "DESIGNER", "VIEWER"];

/** 역할을 고를 수 있는 사람이 줄 수 있는 역할. OWNER 를 주는 일은 OWNER 만 한다(백엔드 GEN-021). */
function assignableRoles(myRole: WorkspaceRole): WorkspaceRole[] {
  return myRole === "OWNER" ? ROLES : ROLES.filter((r) => r !== "OWNER");
}

/**
 * 공간 멤버(ADR-0008 §2-1, 백엔드 fork #23). 멤버는 이 공간의 모든 행사를 운영하는 사람이다 —
 * 신랑신부 같은 행사 고객은 여기가 아니라 행사 화면의 「행사 고객」으로 초대한다.
 */
export function StudioMembers({
  workspaceId,
  myRole,
  myUserId,
  onLeft,
}: {
  workspaceId: string;
  myRole: WorkspaceRole;
  myUserId: string | null;
  /** 내가 이 공간에서 나간 뒤. 부모가 공간 목록을 다시 받아 남은 공간을 고른다. */
  onLeft: () => void;
}) {
  const manage = myRole === "OWNER" || myRole === "ADMIN";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("DESIGNER");
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "remove" | "leave"; member: Member }>(null);

  const load = useCallback(async () => {
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        listMembers(workspaceId),
        manage ? listInvitations(workspaceId) : Promise.resolve([]),
      ]);
      setMembers(nextMembers);
      setInvitations(nextInvitations.filter((i) => i.kind === "WORKSPACE" && i.status === "OPEN"));
      setError(null);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "멤버를 불러오지 못했어요."));
    }
  }, [workspaceId, manage]);

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

  const issue = () =>
    run(
      "invite",
      async () => {
        const issued = await inviteMember(workspaceId, inviteRole);
        // 원문 토큰은 이 응답에서만 받는다. 놓치면 새로 만든다.
        setIssuedLink(inviteLink(window.location.origin, issued.inviteToken));
        await load();
      },
      "초대 링크를 만들지 못했어요.",
    );

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setNotice("링크를 복사했어요. 초대할 분께 직접 보내 주세요.");
    } catch {
      setNotice("복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.");
    }
  };

  if (error) {
    return (
      <p role="alert" className="text-[13px] text-(--hc-danger)">
        {error}
      </p>
    );
  }
  if (!members) return <p className="text-[13px] text-(--hc-muted)">멤버를 불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <p role="status" className="text-[13px]">
          {notice}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {members.map((member) => {
          const isMe = member.userId === myUserId;
          // OWNER 를 건드리는 일은 OWNER 만 한다.
          const canEdit = manage && !isMe && (member.role !== "OWNER" || myRole === "OWNER");
          return (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {member.name}
                  {isMe ? " (나)" : ""}
                </span>
                {canEdit ? null : <span className="block text-[12px] text-(--hc-muted)">{ROLE_LABEL[member.role]}</span>}
              </span>
              <span className="flex items-center gap-2">
                {canEdit ? (
                  <select
                    aria-label={`${member.name} 역할`}
                    className="hc-input h-11 rounded-xl border px-2 text-[13px]"
                    value={member.role}
                    disabled={busy !== null}
                    onChange={(e) =>
                      void run(
                        member.userId,
                        async () => {
                          const next = await changeMemberRole(workspaceId, member.userId, e.target.value as WorkspaceRole);
                          setMembers((prev) => prev?.map((m) => (m.userId === next.userId ? next : m)) ?? null);
                        },
                        "역할을 바꾸지 못했어요.",
                      )
                    }
                  >
                    {assignableRoles(myRole).map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setConfirm({ kind: "remove", member })}
                    className="h-11 rounded-full px-3 text-[13px] text-(--hc-danger) disabled:opacity-50"
                  >
                    내보내기
                  </button>
                ) : null}
                {isMe ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setConfirm({ kind: "leave", member })}
                    className="h-11 rounded-full px-3 text-[13px] text-(--hc-muted) disabled:opacity-50"
                  >
                    나가기
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {manage ? (
        <div className="flex flex-col gap-2">
          {invitations.length > 0 ? (
            <ul className="flex flex-col gap-1 text-[13px]">
              {invitations.map((inv) => (
                <li key={inv.invitationId} className="flex items-center justify-between gap-2">
                  <span className="text-(--hc-muted)">
                    아직 받지 않은 초대 · {inv.role ? ROLE_LABEL[inv.role] : ""}
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        inv.invitationId,
                        async () => {
                          await revokeInvitation(workspaceId, inv.invitationId);
                          await load();
                        },
                        "초대를 취소하지 못했어요.",
                      )
                    }
                    className="h-11 rounded-full px-3 text-(--hc-danger) disabled:opacity-50"
                  >
                    초대 취소
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="studio-invite-role" className="text-[13px] font-semibold">
                초대할 역할
              </label>
              <select
                id="studio-invite-role"
                className="hc-input h-11 rounded-xl border px-2 text-[14px]"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
              >
                {assignableRoles(myRole).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void issue()}
              className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
            >
              {busy === "invite" ? "만드는 중…" : "초대 링크 만들기"}
            </button>
          </div>

          {issuedLink ? (
            <div className="hc-surface-well flex flex-col gap-2 rounded-2xl p-3 text-[13px]">
              <p>
                이 링크는 지금 한 번만 보여요. 7일 동안 한 사람이 한 번 쓸 수 있어요. 메일로 보내지 않으니 직접 전해 주세요.
              </p>
              <p className="break-all font-mono text-[12px]">{issuedLink}</p>
              <button
                type="button"
                onClick={() => void copy(issuedLink)}
                className="hc-button-primary h-11 self-start rounded-full px-4 text-[13px] font-semibold"
              >
                링크 복사
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.kind === "leave" ? "이 공간에서 나갈까요?" : `${confirm.member.name}님을 내보낼까요?`}
          description={
            confirm.kind === "leave"
              ? "이 공간의 행사를 더 운영할 수 없어요. 다시 들어오려면 초대를 받아야 해요."
              : "이 공간의 행사를 더 운영할 수 없고, 행사 사진 권한도 함께 사라져요."
          }
          confirmLabel={confirm.kind === "leave" ? "나가기" : "내보내기"}
          runningLabel="처리하는 중…"
          running={busy === confirm.member.userId}
          destructive
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const { kind, member } = confirm;
            await run(
              member.userId,
              async () => {
                await removeMember(workspaceId, kind === "leave" ? "me" : member.userId);
                if (kind === "leave") onLeft();
                else setMembers((prev) => prev?.filter((m) => m.userId !== member.userId) ?? null);
              },
              kind === "leave" ? "나가지 못했어요." : "내보내지 못했어요.",
            );
            setConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}
