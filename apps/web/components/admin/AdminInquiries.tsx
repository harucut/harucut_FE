"use client";

import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, formatDateTime } from "@/components/admin/adminShared";
import { listInquiries, updateInquiry, type Inquiry, type InquiryStatus } from "@/lib/admin/cmsApi";

const STATUS_LABEL: Record<InquiryStatus, string> = {
  NEW: "새 문의",
  CONTACTED: "연락함",
  QUOTED: "견적 보냄",
  WON: "계약됨",
  LOST: "종료",
};

const CHANNEL_LABEL: Record<string, string> = { BYOD: "참가자 휴대폰", BOOTH: "현장 부스" };

/** 문의 목록 — 상담 상태와 담당 메모를 남기고, 계약으로 넘긴다(R5 10절 「문의에서 서비스 오픈까지」). */
export function AdminInquiries({ onStartContract }: { onStartContract: (inquiry: Inquiry) => void }) {
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listInquiries());
      setError(null);
    } catch (cause) {
      setError(adminErrorMessage(cause, "문의를 불러오지 못했어요."));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  const save = async (inquiry: Inquiry, patch: { status?: InquiryStatus; assigneeNote?: string }) => {
    setBusy(inquiry.inquiryId);
    setNotice(null);
    try {
      const updated = await updateInquiry(inquiry.inquiryId, patch);
      setItems((prev) => (prev ?? []).map((i) => (i.inquiryId === updated.inquiryId ? updated : i)));
      setNotes((prev) => {
        const next = { ...prev };
        delete next[inquiry.inquiryId];
        return next;
      });
    } catch (cause) {
      setNotice(adminErrorMessage(cause, "문의를 바꾸지 못했어요."));
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <p role="alert" className="text-[14px] text-(--hc-danger)">
        {error}
      </p>
    );
  }
  if (!items) return <p className="text-[13px] text-(--hc-muted)">불러오는 중…</p>;
  if (items.length === 0) return <p className="text-[14px] text-(--hc-muted)">아직 문의가 없어요.</p>;

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {notice}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {items.map((inquiry) => {
          const note = notes[inquiry.inquiryId] ?? inquiry.assigneeNote ?? "";
          return (
            <li key={inquiry.inquiryId} className="hc-surface-card flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[16px] font-bold">
                  {inquiry.contactName}
                  <span className="ml-2 text-[13px] font-normal text-(--hc-muted)">
                    {inquiry.organizerType === "BUSINESS" ? "기업·단체" : "개인 행사"}
                  </span>
                </p>
                <span className="text-[12px] text-(--hc-muted)">{formatDateTime(inquiry.createdAt)}</span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                <dt className="text-(--hc-muted)">연락처</dt>
                <dd className="break-all">
                  {inquiry.email}
                  {inquiry.phone ? ` · ${inquiry.phone}` : ""}
                </dd>
                <dt className="text-(--hc-muted)">참가 방식</dt>
                <dd>
                  {inquiry.channels
                    .split(",")
                    .map((c) => CHANNEL_LABEL[c.trim()] ?? c.trim())
                    .join(" · ")}
                </dd>
                <dt className="text-(--hc-muted)">일정·인원</dt>
                <dd>
                  {inquiry.expectedDate ?? "-"} · {inquiry.expectedCount != null ? `${inquiry.expectedCount}명` : "-"}
                </dd>
              </dl>
              <p className="whitespace-pre-wrap rounded-xl bg-(--hc-surface-well) p-3 text-[13px]">{inquiry.message}</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-[13px]">
                  상태
                  <select
                    value={inquiry.status}
                    disabled={busy !== null}
                    onChange={(e) => void save(inquiry, { status: e.target.value as InquiryStatus })}
                    className="hc-input h-11 rounded-xl border px-2 text-[14px]"
                  >
                    {(Object.keys(STATUS_LABEL) as InquiryStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => onStartContract(inquiry)}
                  className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold"
                >
                  계약 만들기
                </button>
              </div>
              <label className="flex flex-col gap-1 text-[13px]">
                담당 메모
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [inquiry.inquiryId]: e.target.value }))}
                  className="hc-input rounded-xl border px-3 py-2 text-[14px]"
                />
              </label>
              {notes[inquiry.inquiryId] !== undefined ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void save(inquiry, { assigneeNote: note })}
                  className="hc-button-primary h-11 self-start rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
                >
                  {busy === inquiry.inquiryId ? "저장하는 중…" : "메모 저장"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
