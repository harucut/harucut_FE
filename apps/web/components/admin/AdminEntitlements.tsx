"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSearchField } from "@/components/admin/AdminSearchField";
import {
  EMPTY_TERMS,
  TermsFields,
  TextField,
  adminErrorMessage,
  describeTerms,
  formatDateTime,
  termsOf,
  type TermsDraft,
} from "@/components/admin/adminShared";
import {
  allocateEntitlement,
  getEntitlementImpact,
  grantEntitlement,
  listEntitlements,
  resizeAllocation,
  revokeEntitlement,
  type Entitlement,
  type EntitlementImpact,
} from "@/lib/admin/cmsApi";
import { toServerDateTime } from "@/lib/studio/eventTime";

type GrantDraft = {
  workspaceId: string;
  eventId: string;
  grantorNote: string;
  validFrom: string;
  validTo: string;
  terms: TermsDraft;
};

const EMPTY_GRANT: GrantDraft = { workspaceId: "", eventId: "", grantorNote: "", validFrom: "", validTo: "", terms: EMPTY_TERMS };

/** 기업 총량에서 행사에 배분하거나(allocate), 배분량을 바꾼다(resize). */
type Allocating = { entitlementId: string; mode: "allocate" | "resize"; eventId: string; quota: string };

/** 1 이상의 정수만. 아니면 null. */
function quotaOf(text: string): number | null {
  const n = Number(text);
  return text.trim() && Number.isSafeInteger(n) && n > 0 ? n : null;
}

type Revoking = { entitlement: Entitlement; impact: EntitlementImpact | null; impactError: string | null; reason: string };

/**
 * 이용권 — 계약으로 생긴 것과 수동 부여(체험 · 보상 · 파트너)를 함께 본다. 수동 부여는 사유가 필수고 결제를 꾸미지 않는다.
 * 회수 전에 영향(운영 중 행사 · 아직 끝나지 않은 합성 예약)을 먼저 보여 준다.
 */
export function AdminEntitlements({ reloadKey = 0 }: { reloadKey?: number }) {
  const [items, setItems] = useState<Entitlement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<GrantDraft>(EMPTY_GRANT);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [revoking, setRevoking] = useState<Revoking | null>(null);
  const [allocating, setAllocating] = useState<Allocating | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listEntitlements());
      setError(null);
    } catch (cause) {
      setError(adminErrorMessage(cause, "이용권을 불러오지 못했어요."));
    }
  }, []);

  // 마운트할 때와, 부모가 reloadKey 를 올릴 때(계약 상태가 바뀜·이용권 탭에 들어옴) 목록을 다시 받는다.
  // 패널은 늘 마운트돼 있어서 마운트 때 한 번만 받으면 계약을 적용해 생긴 이용권이 보이지 않는다(Codex #546).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 원격 조회
    void load();
  }, [load, reloadKey]);

  const terms = termsOf(draft.terms);
  const validFrom = toServerDateTime(draft.validFrom);
  const validTo = toServerDateTime(draft.validTo);
  const canGrant = Boolean(draft.workspaceId.trim() && draft.grantorNote.trim() && validFrom && validTo && terms);

  const grant = async () => {
    if (!canGrant || !terms || !validFrom || !validTo) return;
    setBusy(true);
    setNotice(null);
    try {
      const created = await grantEntitlement({
        workspaceId: draft.workspaceId.trim(),
        ...(draft.eventId.trim() ? { eventId: draft.eventId.trim() } : {}),
        grantorNote: draft.grantorNote.trim(),
        validFrom,
        validTo,
        terms,
      });
      setItems((prev) => [created, ...(prev ?? [])]);
      setDraft(EMPTY_GRANT);
      setFormOpen(false);
      setNotice({ kind: "ok", text: "이용권을 줬어요." });
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorMessage(cause, "이용권을 주지 못했어요.") });
    } finally {
      setBusy(false);
    }
  };

  const startRevoke = async (entitlement: Entitlement) => {
    setNotice(null);
    setRevoking({ entitlement, impact: null, impactError: null, reason: "" });
    try {
      const impact = await getEntitlementImpact(entitlement.entitlementId);
      setRevoking((prev) => (prev?.entitlement.entitlementId === entitlement.entitlementId ? { ...prev, impact } : prev));
    } catch (cause) {
      const impactError = adminErrorMessage(cause, "영향을 확인하지 못했어요.");
      setRevoking((prev) => (prev?.entitlement.entitlementId === entitlement.entitlementId ? { ...prev, impactError } : prev));
    }
  };

  const revoke = async () => {
    if (!revoking || !revoking.reason.trim()) return;
    setBusy(true);
    try {
      const updated = await revokeEntitlement(revoking.entitlement.entitlementId, revoking.reason.trim());
      setItems((prev) => (prev ?? []).map((e) => (e.entitlementId === updated.entitlementId ? updated : e)));
      const { entitlement } = revoking;
      setRevoking(null);
      setNotice({ kind: "ok", text: "이용권을 회수했어요." });
      // 배분을 회수하면 그 양이 부모로 돌아가고, 부모를 회수하면 활성 배분도 함께 회수된다 — 목록을 다시 받는다.
      if (entitlement.parentEntitlementId || (entitlement.allocatedQuota ?? 0) > 0) await load();
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorMessage(cause, "이용권을 회수하지 못했어요.") });
      void load();
    } finally {
      setBusy(false);
    }
  };

  // 배분·배분량 변경은 부모의 allocatedQuota 도 바꾸므로 목록을 다시 받는다.
  const allocate = async () => {
    const quota = allocating ? quotaOf(allocating.quota) : null;
    if (!allocating || quota === null || (allocating.mode === "allocate" && !allocating.eventId.trim())) return;
    setBusy(true);
    setNotice(null);
    try {
      if (allocating.mode === "allocate") {
        await allocateEntitlement(allocating.entitlementId, allocating.eventId.trim(), quota);
      } else {
        await resizeAllocation(allocating.entitlementId, quota);
      }
      setNotice({ kind: "ok", text: allocating.mode === "allocate" ? "행사에 배분했어요." : "배분량을 바꿨어요." });
      setAllocating(null);
      await load();
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorMessage(cause, "배분하지 못했어요.") });
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<GrantDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? "text-[13px] text-(--hc-danger)" : "text-[13px]"}>
          {notice.text}
        </p>
      ) : null}

      {formOpen ? (
        <form
          aria-label="수동 이용권 주기"
          className="hc-surface-card flex flex-col gap-4 rounded-2xl p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void grant();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <TextField label="공간 ID" value={draft.workspaceId} onChange={(v) => set({ workspaceId: v })} required help="조직 공간에만 줄 수 있어요." />
              <AdminSearchField kind="workspace" onPick={(w) => set({ workspaceId: w.workspaceId })} />
            </div>
            <div className="flex flex-col gap-2">
              <TextField label="행사 ID" value={draft.eventId} onChange={(v) => set({ eventId: v })} help="적으면 그 행사에만 적용돼요." />
              <AdminSearchField kind="event" onPick={(ev) => set({ eventId: ev.eventId, workspaceId: ev.workspaceId })} />
            </div>
            <TextField label="시작" type="datetime-local" value={draft.validFrom} onChange={(v) => set({ validFrom: v })} required help="한국 시간" />
            <TextField label="끝" type="datetime-local" value={draft.validTo} onChange={(v) => set({ validTo: v })} required help="한국 시간" />
          </div>
          <label className="flex flex-col gap-1 text-[13px]">
            <span>
              부여 사유<span className="ml-1 text-(--hc-danger)">*</span>
            </span>
            <textarea
              rows={2}
              maxLength={500}
              value={draft.grantorNote}
              onChange={(e) => set({ grantorNote: e.target.value })}
              placeholder="예: 파트너 웨딩홀 체험 1개월"
              className="hc-input rounded-xl border px-3 py-2 text-[14px]"
            />
          </label>
          <TermsFields value={draft.terms} onChange={(t) => set({ terms: t })} />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!canGrant || busy}
              className="hc-button-primary h-11 rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
            >
              {busy ? "주는 중…" : "이용권 주기"}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="h-11 rounded-full px-4 text-[14px]">
              닫기
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="hc-button-secondary h-11 self-start rounded-full px-4 text-[13px] font-semibold"
        >
          수동 이용권 주기
        </button>
      )}

      {error ? (
        <p role="alert" className="text-[14px] text-(--hc-danger)">
          {error}
        </p>
      ) : !items ? (
        <p className="text-[13px] text-(--hc-muted)">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-[14px] text-(--hc-muted)">아직 이용권이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((e) => {
            const open = revoking?.entitlement.entitlementId === e.entitlementId ? revoking : null;
            const alloc = allocating?.entitlementId === e.entitlementId ? allocating : null;
            const isChild = Boolean(e.parentEntitlementId);
            // 배분은 활성 공간 범위 이용권(그 자신이 배분이 아닌 것)에서만 한다.
            const isParent = e.scope === "WORKSPACE" && !isChild;
            const allocated = e.allocatedQuota ?? 0;
            return (
              <li key={e.entitlementId} className="hc-surface-card flex flex-col gap-2 rounded-2xl p-4 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[15px] font-bold">
                    {e.scope === "EVENT" ? `행사 ${e.eventId}` : `공간 ${e.workspaceId}`}
                    <span className="ml-2 text-[12px] font-normal text-(--hc-muted)">
                      {isChild
                        ? `기업 총량 ${e.parentEntitlementId}에서 배분`
                        : e.source === "CONTRACT"
                          ? `계약 ${e.contractId ?? ""}`
                          : "수동 부여"}
                    </span>
                  </p>
                  <span className="rounded-full bg-(--hc-surface-well) px-3 py-1 text-[12px] font-semibold">
                    {e.status === "ACTIVE" ? "유효" : "회수됨"}
                  </span>
                </div>
                <p>
                  {formatDateTime(e.validFrom)} ~ {formatDateTime(e.validTo)}
                </p>
                <p>{describeTerms(e.terms)}</p>
                <p className="tabular-nums">
                  완성 {e.used.toLocaleString("ko-KR")} · 만드는 중 {e.reserved.toLocaleString("ko-KR")} / {e.terms.composeQuota.toLocaleString("ko-KR")}장
                </p>
                {isParent && (allocated > 0 || e.status === "ACTIVE") ? (
                  <p className="tabular-nums">
                    행사 배분 {allocated.toLocaleString("ko-KR")}장 · 더 배분할 수 있는 양{" "}
                    {Math.max(0, e.terms.composeQuota - allocated).toLocaleString("ko-KR")}장
                  </p>
                ) : null}
                {e.grantorNote ? <p className="text-(--hc-muted)">사유: {e.grantorNote}</p> : null}
                {e.revokeReason ? <p className="text-(--hc-muted)">회수 사유: {e.revokeReason}</p> : null}

                {e.status === "ACTIVE" && !open && !alloc ? (
                  <div className="flex flex-wrap gap-2">
                    {isParent ? (
                      <button
                        type="button"
                        onClick={() => setAllocating({ entitlementId: e.entitlementId, mode: "allocate", eventId: "", quota: "" })}
                        className="hc-button-secondary h-11 rounded-full px-4 font-semibold"
                      >
                        행사에 배분
                      </button>
                    ) : null}
                    {isChild ? (
                      <button
                        type="button"
                        onClick={() =>
                          setAllocating({ entitlementId: e.entitlementId, mode: "resize", eventId: "", quota: String(e.terms.composeQuota) })
                        }
                        className="hc-button-secondary h-11 rounded-full px-4 font-semibold"
                      >
                        배분량 바꾸기
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void startRevoke(e)}
                      className="h-11 rounded-full border border-(--hc-danger-border) px-4 font-semibold text-(--hc-danger)"
                    >
                      회수
                    </button>
                  </div>
                ) : null}

                {alloc ? (
                  <form
                    aria-label={alloc.mode === "allocate" ? "행사에 배분" : "배분량 바꾸기"}
                    className="flex flex-col gap-2 rounded-xl border border-(--hc-border) p-3"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      void allocate();
                    }}
                  >
                    {alloc.mode === "allocate" ? (
                      <div className="flex flex-col gap-2">
                        <TextField
                          label="행사 ID"
                          value={alloc.eventId}
                          onChange={(v) => setAllocating({ ...alloc, eventId: v })}
                          required
                          help="이 공간의 행사만 배분할 수 있어요. 기간·기능·조건은 기업 총량을 따라요."
                        />
                        <AdminSearchField kind="event" onPick={(ev) => setAllocating({ ...alloc, eventId: ev.eventId })} />
                      </div>
                    ) : null}
                    <TextField
                      label="배분량(장)"
                      type="number"
                      value={alloc.quota}
                      onChange={(v) => setAllocating({ ...alloc, quota: v })}
                      required
                      error={alloc.quota.trim() && quotaOf(alloc.quota) === null ? "1 이상의 정수로 적어 주세요." : undefined}
                      help={
                        alloc.mode === "resize"
                          ? `이미 쓴 ${(e.used + e.reserved).toLocaleString("ko-KR")}장(만드는 중 포함)보다 적게 줄일 수 없어요.`
                          : undefined
                      }
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={busy || quotaOf(alloc.quota) === null || (alloc.mode === "allocate" && !alloc.eventId.trim())}
                        className="hc-button-primary h-11 rounded-full px-4 font-semibold disabled:opacity-50"
                      >
                        {busy ? "저장하는 중…" : alloc.mode === "allocate" ? "배분하기" : "바꾸기"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setAllocating(null)} className="h-11 rounded-full px-4">
                        그만두기
                      </button>
                    </div>
                  </form>
                ) : null}

                {open ? (
                  <div role="group" aria-label="이용권 회수" className="flex flex-col gap-2 rounded-xl border border-(--hc-danger-border) p-3">
                    {open.impactError ? (
                      <p role="alert" className="text-(--hc-danger)">
                        {open.impactError}
                      </p>
                    ) : !open.impact ? (
                      <p className="text-(--hc-muted)">영향을 확인하는 중…</p>
                    ) : (
                      <p>
                        운영 중 행사 {open.impact.liveEvents.length}개
                        {open.impact.liveEvents.length ? `(${open.impact.liveEvents.join(", ")})` : ""} · 아직 끝나지 않은 합성{" "}
                        {open.impact.openReservations}건. 회수하면 새 게시·촬영을 받지 않고, 접수된 합성은 그대로 마무리돼요.
                      </p>
                    )}
                    <label className="flex flex-col gap-1">
                      <span>
                        회수 사유<span className="ml-1 text-(--hc-danger)">*</span>
                      </span>
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={open.reason}
                        onChange={(ev) => setRevoking({ ...open, reason: ev.target.value })}
                        className="hc-input rounded-xl border px-3 py-2 text-[14px]"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy || !open.reason.trim() || !open.impact}
                        onClick={() => void revoke()}
                        className="h-11 rounded-full border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) px-4 font-semibold text-(--hc-danger) disabled:opacity-50"
                      >
                        {busy ? "회수하는 중…" : "회수하기"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setRevoking(null)} className="h-11 rounded-full px-4">
                        그만두기
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
