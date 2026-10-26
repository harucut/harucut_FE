"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import { resolveMembership } from "@/lib/authSession";
import { clearInviteToken, isInviteToken, readInviteToken, stashInviteToken } from "@/lib/invite/pendingInvite";
import {
  PERMISSION_LABEL,
  ROLE_LABEL,
  acceptInvitation,
  previewInvitation,
  type InvitationPreview,
} from "@/lib/studio/accessApi";

type View =
  | { kind: "loading" }
  | { kind: "no-token" }
  | { kind: "need-login" }
  | { kind: "preview"; preview: InvitationPreview }
  | { kind: "accepting"; preview: InvitationPreview }
  | { kind: "error"; message: string; retryable: boolean; alreadyJoined?: boolean };

/** 다시 해도 소용없는 초대 오류. 토큰을 지우고 새 링크를 받으라고 한다. */
const DEAD_INVITE_CODES = new Set(["MEMBER-001", "MEMBER-002"]);

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * 초대 받기(ADR-0008 §2). 링크만 받은 사람이 모르는 공간에 들어가지 않도록 **수락 전에 무엇에 들어가는지**
 * 보여 준다 — 공간·행사 이름, 역할·권한, 보낸 사람, 만료.
 *
 * 토큰은 fragment 에서 읽어 이 탭의 sessionStorage 로 옮기고 주소창에서는 지운다(기록·리퍼러로 새지 않게).
 * 로그인하러 다녀와도 그 자리에서 이어진다.
 */
export function InviteAccept() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });
  const tokenRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      setView({ kind: "no-token" });
      return;
    }
    setView({ kind: "loading" });
    const membership = await resolveMembership();
    if (membership === "guest") {
      setView({ kind: "need-login" });
      return;
    }
    if (membership === "unknown") {
      setView({ kind: "error", message: "로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", retryable: true });
      return;
    }
    try {
      setView({ kind: "preview", preview: await previewInvitation(token) });
    } catch (error) {
      const { code, status } = getApiErrorDetails(error);
      if (code && DEAD_INVITE_CODES.has(code)) clearInviteToken();
      setView({
        kind: "error",
        message: getUserFacingApiErrorMessage(error, "초대를 확인하지 못했어요."),
        retryable: !code || status === undefined || status >= 500,
      });
    }
  }, []);

  useEffect(() => {
    const fragment = window.location.hash.replace(/^#/, "");
    if (isInviteToken(fragment)) {
      stashInviteToken(fragment);
      tokenRef.current = fragment;
      // 토큰을 주소창·방문 기록에서 지운다. 화면은 sessionStorage 로 이어 간다.
      window.history.replaceState(null, "", "/invite");
    } else {
      tokenRef.current = readInviteToken();
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 판정
    void load();
  }, [load]);

  const accept = async (preview: InvitationPreview) => {
    const token = tokenRef.current;
    if (!token) return;
    setView({ kind: "accepting", preview });
    try {
      const accepted = await acceptInvitation(token);
      clearInviteToken();
      router.replace(
        accepted.kind === "WORKSPACE" && accepted.workspaceId
          ? `/studio?workspace=${encodeURIComponent(accepted.workspaceId)}`
          : "/studio",
      );
    } catch (error) {
      const { code, status } = getApiErrorDetails(error);
      const alreadyJoined = code === "MEMBER-003";
      // 이미 참여 중이면 토큰은 쓰이지 않았다(다른 사람에게 다시 건넬 수 있다) — 이 기기에서만 지운다.
      if (alreadyJoined || (code && DEAD_INVITE_CODES.has(code))) clearInviteToken();
      setView({
        kind: "error",
        message: getUserFacingApiErrorMessage(error, "초대를 받지 못했어요."),
        retryable: !alreadyJoined && (!code || status === undefined || status >= 500),
        alreadyJoined,
      });
    }
  };

  const decline = () => {
    clearInviteToken();
    router.replace("/home");
  };

  return (
    <main className="hc-page-app flex min-h-dvh items-center justify-center px-4 py-10 text-(--hc-text)">
      <div className="hc-surface-card flex w-full max-w-md flex-col gap-4 rounded-3xl p-6">
        <h1 className="text-[24px] font-extrabold tracking-tight">초대 받기</h1>

        {view.kind === "loading" ? <p className="text-[14px] text-(--hc-muted)">초대를 확인하는 중…</p> : null}

        {view.kind === "no-token" ? (
          <p className="text-[14px] text-(--hc-muted)">초대 링크를 다시 열어 주세요. 링크 전체가 열리지 않았을 수 있어요.</p>
        ) : null}

        {view.kind === "need-login" ? (
          <>
            <p className="text-[14px]">초대를 받으려면 먼저 로그인해 주세요. 로그인한 뒤 이 화면으로 돌아와요.</p>
            <Link
              href={`/login?redirectTo=${encodeURIComponent("/invite")}`}
              className="hc-button-primary flex h-11 items-center justify-center rounded-full text-[14px] font-semibold"
            >
              로그인하고 초대 받기
            </Link>
          </>
        ) : null}

        {view.kind === "preview" || view.kind === "accepting" ? (
          <>
            <InvitePreviewText preview={view.preview} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={decline}
                disabled={view.kind === "accepting"}
                className="h-11 flex-1 rounded-full border border-(--hc-border) text-[14px] font-semibold disabled:opacity-50"
              >
                받지 않기
              </button>
              <button
                type="button"
                onClick={() => void accept(view.preview)}
                disabled={view.kind === "accepting"}
                className="hc-button-primary h-11 flex-1 rounded-full text-[14px] font-semibold disabled:opacity-50"
              >
                {view.kind === "accepting" ? "받는 중…" : "초대 받기"}
              </button>
            </div>
          </>
        ) : null}

        {view.kind === "error" ? (
          <>
            <p role="alert" className="text-[14px] text-(--hc-danger)">
              {view.message}
            </p>
            {view.retryable ? (
              <button
                type="button"
                onClick={() => void load()}
                className="hc-button-secondary h-11 rounded-full text-[14px] font-semibold"
              >
                다시 확인
              </button>
            ) : null}
            {view.alreadyJoined ? (
              <Link href="/studio" className="hc-button-primary flex h-11 items-center justify-center rounded-full text-[14px] font-semibold">
                행사 운영으로 가기
              </Link>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function InvitePreviewText({ preview }: { preview: InvitationPreview }) {
  const expires = formatDate(preview.expiresAt);
  return (
    <div className="flex flex-col gap-2 text-[14px] leading-6">
      {preview.kind === "WORKSPACE" ? (
        <p>
          <b>{preview.invitedByName}</b>님이 <b>{preview.workspaceName}</b> 공간에
          {preview.role ? (
            <>
              {" "}
              <b>{ROLE_LABEL[preview.role]}</b>
              {preview.role === "VIEWER" ? "으로" : "로"}
            </>
          ) : null}{" "}
          초대했어요.
        </p>
      ) : (
        <>
          <p>
            <b>{preview.invitedByName}</b>님이 <b>{preview.eventName ?? preview.workspaceName}</b> 행사의 사진을 볼 수 있게
            초대했어요.
          </p>
          {preview.permissions && preview.permissions.length > 0 ? (
            <ul className="list-inside list-disc text-[13px] text-(--hc-muted)">
              {preview.permissions.map((p) => (
                <li key={p}>{PERMISSION_LABEL[p]}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {expires ? <p className="text-[12px] text-(--hc-muted)">{expires}까지 받을 수 있어요.</p> : null}
    </div>
  );
}
