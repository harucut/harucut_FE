"use client";

import { useState, type FormEvent } from "react";
import { adminErrorMessage, formatDateTime } from "@/components/admin/adminShared";
import { SingleFieldDialog } from "@/components/ui/SingleFieldDialog";
import { getApiErrorDetails } from "@/lib/apiError";
import { blockUser, searchUsers, unblockUser, type AdminUser } from "@/lib/admin/cmsApi";

type PendingAction = { user: AdminUser; action: "block" | "unblock" };

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "사용 중",
  BLOCKED: "정지됨",
  DELETED_REQUESTED: "탈퇴 요청",
};

const PROVIDER_LABEL: Record<string, string> = {
  GOOGLE: "구글",
  KAKAO: "카카오",
  NAVER: "네이버",
  APPLE: "애플",
  HARUCUT: "이메일 가입",
};

/**
 * 계정 찾기와 정지(R5 381줄). 이메일이 정확히 같은 계정만 찾는다 — 목록을 훑어 볼 화면이 아니다.
 * 정지하면 모든 세션이 끊기고 로그인할 수 없다. 사유는 감사 로그에 남는다. 자기 자신과 마지막 관리자는 서버가 막는다.
 */
export function AdminUsers() {
  const [email, setEmail] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const query = email.trim();
    if (!query) return;
    setSearching(true);
    setError(null);
    setNotice(null);
    try {
      setUsers(await searchUsers(query));
    } catch (cause) {
      setUsers(null);
      setError(adminErrorMessage(cause, "계정을 찾지 못했어요."));
    } finally {
      setSearching(false);
    }
  };

  const submit = async ({ user, action }: PendingAction, reason: string) => {
    setSaving(true);
    setDialogError(null);
    try {
      const saved = action === "block" ? await blockUser(user.userId, reason) : await unblockUser(user.userId, reason);
      setUsers((prev) => prev?.map((u) => (u.userId === user.userId ? { ...u, userStatus: saved.userStatus } : u)) ?? prev);
      setNotice(action === "block" ? "계정을 정지했어요. 모든 기기에서 로그아웃돼요." : "정지를 풀었어요. 다시 로그인할 수 있어요.");
      setPending(null);
    } catch (cause) {
      // 이 화면까지 온 관리자에게 403 은 대개 자기 자신이나 마지막 관리자를 정지하려 한 것이다. 「관리자만 쓸 수 있어요」는 맞지 않는다.
      setDialogError(
        action === "block" && getApiErrorDetails(cause).status === 403
          ? "이 계정은 정지할 수 없어요. 내 계정이거나 마지막 관리자일 수 있어요."
          : adminErrorMessage(cause, action === "block" ? "정지하지 못했어요." : "정지를 풀지 못했어요."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(event) => void search(event)} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-[13px] font-semibold">
          이메일
          <input
            type="email"
            name="adminUserEmail"
            autoComplete="off"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="가입한 이메일 그대로…"
            className="hc-input h-11 rounded-xl border px-3 text-[14px] font-normal"
          />
        </label>
        <button type="submit" disabled={searching} className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50">
          {searching ? "찾는 중…" : "찾기"}
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-[14px] text-(--hc-danger)">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-[13px]">
          {notice}
        </p>
      ) : null}
      {users?.length === 0 ? <p className="text-[14px] text-(--hc-muted)">이 이메일로 가입한 계정이 없어요.</p> : null}
      {users && users.length > 0 ? (
        <ul className="flex flex-col divide-y divide-(--hc-border)">
          {users.map((user) => {
            const blocked = user.userStatus === "BLOCKED";
            return (
              <li key={user.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="break-words text-[14px] font-semibold">{user.username?.trim() || user.email || "이름 없는 계정"}</p>
                  <p className="break-all text-[12px] text-(--hc-muted)">
                    {[
                      user.email,
                      user.provider ? (PROVIDER_LABEL[user.provider] ?? user.provider) : null,
                      user.userRole === "ADMIN" ? "플랫폼 관리자" : null,
                      STATUS_LABEL[user.userStatus] ?? user.userStatus,
                      user.createdAt ? `${formatDateTime(user.createdAt)} 가입` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDialogError(null);
                    setPending({ user, action: blocked ? "unblock" : "block" });
                  }}
                  className={
                    blocked
                      ? "h-11 shrink-0 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold"
                      : "h-11 shrink-0 rounded-full border border-(--hc-danger-border) px-4 text-[13px] font-semibold text-(--hc-danger)"
                  }
                >
                  {blocked ? "정지 풀기" : "정지"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {pending ? (
        <SingleFieldDialog
          title={pending.action === "block" ? "이 계정을 정지할까요?" : "정지를 풀까요?"}
          description={
            pending.action === "block"
              ? "모든 기기에서 로그아웃되고 다시 로그인할 수 없어요. 이유는 감사 로그에 남아요."
              : "다시 로그인할 수 있어요. 이유는 감사 로그에 남아요."
          }
          submitLabel={pending.action === "block" ? "정지" : "정지 풀기"}
          submittingLabel="처리하는 중"
          destructive={pending.action === "block"}
          label={pending.action === "block" ? "정지 이유" : "푸는 이유"}
          placeholder={pending.action === "block" ? "예: 약관 위반 신고 확인" : "예: 소명 확인"}
          initialValue=""
          maxLength={200}
          saving={saving}
          error={dialogError}
          onClose={() => setPending(null)}
          onSubmit={(reason) => void submit(pending, reason)}
        />
      ) : null}
    </div>
  );
}
