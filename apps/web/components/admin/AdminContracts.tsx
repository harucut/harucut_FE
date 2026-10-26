"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AdminSearchField } from "@/components/admin/AdminSearchField";
import {
  EMPTY_TERMS,
  TermsFields,
  TextField,
  adminErrorMessage,
  describeTerms,
  formatDateTime,
  optionalInt,
  termsOf,
  type TermsDraft,
} from "@/components/admin/adminShared";
import {
  changeContractStatus,
  createContract,
  listContracts,
  type Contract,
  type ContractStatus,
  type EntitlementScope,
  type PaymentEvidence,
} from "@/lib/admin/cmsApi";
import { withRequestDeadline } from "@/lib/requestDeadline";
import { toServerDateTime } from "@/lib/studio/eventTime";

const STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: "초안",
  ACTIVE: "적용 중",
  ENDED: "종료",
  CANCELLED: "취소",
};

/** 상태마다 고를 수 있는 다음 상태(백엔드 전이 규칙과 같다 — 그 밖은 409 ENT-003). */
const TRANSITIONS: Record<ContractStatus, Array<{ to: ContractStatus; label: string; title: string; description: string; destructive?: boolean }>> = {
  DRAFT: [
    {
      to: "ACTIVE",
      label: "적용하기",
      title: "이 계약을 적용할까요?",
      description: "계약 조건대로 이용권이 생기고, 그 공간(또는 행사)이 바로 게시·촬영에 쓸 수 있어요.",
    },
    { to: "CANCELLED", label: "취소", title: "이 계약을 취소할까요?", description: "이용권이 생기지 않아요. 되돌릴 수 없어요.", destructive: true },
  ],
  ACTIVE: [
    {
      to: "ENDED",
      label: "종료",
      title: "이 계약을 지금 끝낼까요?",
      description: "이용권이 지금 끝나 새 게시·촬영을 받지 않아요. 이미 접수된 합성은 그대로 마무리돼요. 되돌릴 수 없어요.",
      destructive: true,
    },
    {
      to: "CANCELLED",
      label: "취소",
      title: "이 계약을 취소할까요?",
      description: "이용권이 지금 끝나 새 게시·촬영을 받지 않아요. 이미 접수된 합성은 그대로 마무리돼요. 되돌릴 수 없어요.",
      destructive: true,
    },
  ],
  ENDED: [],
  CANCELLED: [],
};

function eventIdsOf(text: string) {
  return text
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

/** 상태 전이 요청 상한. 확인 창은 요청이 끝나야 닫히므로 반드시 끝나게 한다(ConfirmDialog 주석). */
const ACTION_DEADLINE_MS = 20_000;

type Draft = {
  workspaceId: string;
  contractorName: string;
  scope: EntitlementScope;
  eventIds: string;
  amount: string;
  startsAt: string;
  endsAt: string;
  evidenceKind: PaymentEvidence["kind"] | "";
  evidenceReference: string;
  terms: TermsDraft;
};

const EMPTY_DRAFT: Draft = {
  workspaceId: "",
  contractorName: "",
  scope: "WORKSPACE",
  eventIds: "",
  amount: "",
  startsAt: "",
  endsAt: "",
  evidenceKind: "",
  evidenceReference: "",
  terms: EMPTY_TERMS,
};

/** 계약 — DRAFT 로 만들고 ACTIVE 로 바꾸면 이용권이 생긴다. 결제를 꾸미지 않는다: 근거는 참조만 남긴다. */
export function AdminContracts({ prefill }: { prefill?: { contractorName: string; nonce: number } | null }) {
  const [items, setItems] = useState<Contract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<{ contract: Contract; to: (typeof TRANSITIONS)[ContractStatus][number] } | null>(null);
  const [running, setRunning] = useState(false);
  const [appliedPrefill, setAppliedPrefill] = useState<number | null>(null);

  // 문의에서 「계약 만들기」로 넘어오면 계약자 이름을 채워 새 계약 칸을 연다.
  if (prefill && prefill.nonce !== appliedPrefill) {
    setAppliedPrefill(prefill.nonce);
    setDraft({ ...EMPTY_DRAFT, contractorName: prefill.contractorName });
    setFormOpen(true);
  }

  const load = useCallback(async () => {
    try {
      setItems(await listContracts());
      setError(null);
    } catch (cause) {
      setError(adminErrorMessage(cause, "계약을 불러오지 못했어요."));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  const terms = termsOf(draft.terms);
  const startsAt = toServerDateTime(draft.startsAt);
  const endsAt = toServerDateTime(draft.endsAt);
  const eventIds = eventIdsOf(draft.eventIds);
  const evidencePartial = Boolean(draft.evidenceKind) !== Boolean(draft.evidenceReference.trim());
  const canCreate =
    Boolean(draft.workspaceId.trim() && draft.contractorName.trim() && startsAt && endsAt && terms) &&
    (draft.scope === "WORKSPACE" || eventIds.length > 0) &&
    !evidencePartial;

  const create = async () => {
    if (!canCreate || !terms || !startsAt || !endsAt) return;
    setCreating(true);
    setNotice(null);
    try {
      const amount = optionalInt(draft.amount);
      const created = await createContract({
        workspaceId: draft.workspaceId.trim(),
        contractorName: draft.contractorName.trim(),
        scope: draft.scope,
        ...(draft.scope === "EVENT" ? { eventIds } : {}),
        ...(amount !== undefined ? { amount, currency: "KRW" } : {}),
        startsAt,
        endsAt,
        ...(draft.evidenceKind ? { paymentEvidence: { kind: draft.evidenceKind, reference: draft.evidenceReference.trim() } } : {}),
        entitlement: terms,
      });
      setItems((prev) => [created, ...(prev ?? [])]);
      setDraft(EMPTY_DRAFT);
      setFormOpen(false);
      setNotice({ kind: "ok", text: "계약을 초안으로 만들었어요. 「적용하기」를 누르면 이용권이 생겨요." });
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorMessage(cause, "계약을 만들지 못했어요.") });
    } finally {
      setCreating(false);
    }
  };

  const transition = async () => {
    if (!pending) return;
    setRunning(true);
    try {
      const updated = await withRequestDeadline(ACTION_DEADLINE_MS, (signal) =>
        changeContractStatus(pending.contract.contractId, pending.to.to, signal),
      );
      setItems((prev) => (prev ?? []).map((c) => (c.contractId === updated.contractId ? updated : c)));
      setNotice({ kind: "ok", text: `계약을 「${STATUS_LABEL[updated.status]}」으로 바꿨어요.` });
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorMessage(cause, "계약 상태를 바꾸지 못했어요.") });
      // 다른 곳이 먼저 바꿨을 수 있다(ENT-003) — 목록을 맞춘다.
      void load();
    } finally {
      setRunning(false);
      setPending(null);
    }
  };

  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? "text-[13px] text-(--hc-danger)" : "text-[13px]"}>
          {notice.text}
        </p>
      ) : null}

      {formOpen ? (
        <form
          aria-label="새 계약"
          className="hc-surface-card flex flex-col gap-4 rounded-2xl p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <TextField label="공간 ID" value={draft.workspaceId} onChange={(v) => set({ workspaceId: v })} required help="조직 공간에만 줄 수 있어요." />
              <AdminSearchField kind="workspace" onPick={(w) => set({ workspaceId: w.workspaceId })} />
            </div>
            <TextField label="계약자" value={draft.contractorName} onChange={(v) => set({ contractorName: v })} required maxLength={100} />
            <TextField label="시작" type="datetime-local" value={draft.startsAt} onChange={(v) => set({ startsAt: v })} required help="한국 시간" />
            <TextField label="끝" type="datetime-local" value={draft.endsAt} onChange={(v) => set({ endsAt: v })} required help="한국 시간" />
            <TextField label="금액(원)" type="number" value={draft.amount} onChange={(v) => set({ amount: v })} />
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[14px] font-semibold">적용 범위</legend>
            {(
              [
                ["WORKSPACE", "공간의 모든 행사"],
                ["EVENT", "고른 행사만"],
              ] as const
            ).map(([scope, label]) => (
              <label key={scope} className="flex min-h-11 items-center gap-2 text-[14px]">
                <input type="radio" name="contract-scope" className="size-5" checked={draft.scope === scope} onChange={() => set({ scope })} />
                {label}
              </label>
            ))}
            {draft.scope === "EVENT" ? (
              <>
                <TextField label="행사 ID" value={draft.eventIds} onChange={(v) => set({ eventIds: v })} required help="여러 개면 쉼표로 나눠요." />
                <AdminSearchField
                  kind="event"
                  onPick={(ev) =>
                    setDraft((prev) => ({
                      ...prev,
                      // 행사 범위 계약도 그 행사가 속한 공간 ID 가 필요하다. 비었으면 채운다.
                      workspaceId: prev.workspaceId.trim() || ev.workspaceId,
                      eventIds: eventIdsOf(prev.eventIds).includes(ev.eventId)
                        ? prev.eventIds
                        : [...eventIdsOf(prev.eventIds), ev.eventId].join(", "),
                    }))
                  }
                />
              </>
            ) : null}
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-[14px] font-semibold">결제·입금 근거</legend>
            <label className="flex flex-col gap-1 text-[13px]">
              종류<span className="text-(--hc-muted)">(선택)</span>
              <select
                value={draft.evidenceKind}
                onChange={(e) => set({ evidenceKind: e.target.value as Draft["evidenceKind"] })}
                className="hc-input h-11 rounded-xl border px-2 text-[14px]"
              >
                <option value="">없음</option>
                <option value="BANK_TRANSFER">계좌 입금</option>
                <option value="PORTONE">PortOne 결제</option>
                <option value="OTHER">기타</option>
              </select>
            </label>
            <TextField label="참조(입금자명·결제 번호 등)" value={draft.evidenceReference} onChange={(v) => set({ evidenceReference: v })} maxLength={200} />
            {evidencePartial ? <p className="text-[12px] text-(--hc-danger) sm:col-span-2">종류와 참조를 함께 적어 주세요.</p> : null}
          </fieldset>
          <TermsFields value={draft.terms} onChange={(t) => set({ terms: t })} />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!canCreate || creating}
              className="hc-button-primary h-11 rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
            >
              {creating ? "만드는 중…" : "초안으로 만들기"}
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
          새 계약
        </button>
      )}

      {error ? (
        <p role="alert" className="text-[14px] text-(--hc-danger)">
          {error}
        </p>
      ) : !items ? (
        <p className="text-[13px] text-(--hc-muted)">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-[14px] text-(--hc-muted)">아직 계약이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((contract) => (
            <li key={contract.contractId} className="hc-surface-card flex flex-col gap-2 rounded-2xl p-4 text-[13px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[16px] font-bold">{contract.contractorName}</p>
                <span className="rounded-full bg-(--hc-surface-well) px-3 py-1 text-[12px] font-semibold">{STATUS_LABEL[contract.status]}</span>
              </div>
              <p className="text-(--hc-muted)">
                공간 {contract.workspaceId}
                {contract.scope === "EVENT" ? ` · 행사 ${(contract.eventIds ?? []).join(", ")}` : " · 공간 전체"}
              </p>
              <p>
                {formatDateTime(contract.startsAt)} ~ {formatDateTime(contract.endsAt)}
                {contract.amount != null ? ` · ${contract.amount.toLocaleString("ko-KR")}${contract.currency === "KRW" || !contract.currency ? "원" : ` ${contract.currency}`}` : ""}
              </p>
              <p>{describeTerms(contract.entitlement)}</p>
              {contract.paymentEvidence ? (
                <p className="text-(--hc-muted)">
                  근거: {contract.paymentEvidence.kind} · {contract.paymentEvidence.reference}
                  {contract.paymentEvidence.kind === "PORTONE"
                    ? contract.paymentVerifiedAt
                      ? ` · 결제 확인됨(${formatDateTime(contract.paymentVerifiedAt)})`
                      : " · 결제 확인 전"
                    : ""}
                </p>
              ) : null}
              {TRANSITIONS[contract.status].length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {TRANSITIONS[contract.status].map((t) => (
                    <button
                      key={t.to}
                      type="button"
                      onClick={() => setPending({ contract, to: t })}
                      className={
                        t.destructive
                          ? "h-11 rounded-full border border-(--hc-danger-border) px-4 font-semibold text-(--hc-danger)"
                          : "hc-button-primary h-11 rounded-full px-4 font-semibold"
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {pending ? (
        <ConfirmDialog
          title={pending.to.title}
          description={pending.to.description}
          confirmLabel={pending.to.label}
          runningLabel="바꾸는 중…"
          running={running}
          destructive={pending.to.destructive}
          onClose={() => setPending(null)}
          onConfirm={() => void transition()}
        />
      ) : null}
    </div>
  );
}
