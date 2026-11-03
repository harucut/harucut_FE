"use client";

import { useState } from "react";
import { AdminSearchField } from "@/components/admin/AdminSearchField";
import { adminErrorMessage } from "@/components/admin/adminShared";
import { SingleFieldDialog } from "@/components/ui/SingleFieldDialog";
import { setWorkspaceKind, type AdminWorkspaceItem, type WorkspaceKind } from "@/lib/admin/cmsApi";

const KIND_LABEL: Record<WorkspaceKind, string> = { HOST: "주최자", ENTERPRISE: "업체" };

/**
 * 공간을 업체(ENTERPRISE)·주최자(HOST)로 바꾼다(2026-11-03 결정).
 *
 * 업체 공간은 멤버(직원)가 행사 사진을 받지 못하고, 링크를 받은 고객이 받는다. 보통 업체 계약을 만들 때
 * 함께 켠다. 개인 공간은 늘 주최자다(행사가 없다). 사진 숨김 자체는 서버가 권한으로 하고, 여기선 종류만 바꾼다.
 */
export function AdminWorkspaceKind() {
  const [picked, setPicked] = useState<AdminWorkspaceItem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const kind: WorkspaceKind = picked?.kind ?? "HOST";
  const next: WorkspaceKind = kind === "ENTERPRISE" ? "HOST" : "ENTERPRISE";
  const isOrg = picked?.type === "ORGANIZATION";

  const submit = async (reason: string) => {
    if (!picked) return;
    setSaving(true);
    setDialogError(null);
    try {
      const saved = await setWorkspaceKind(picked.workspaceId, next, reason);
      setPicked({ ...picked, kind: saved.kind });
      setNotice(
        saved.kind === "ENTERPRISE"
          ? "업체 공간으로 바꿨어요. 멤버는 사진을 받지 않고, 초대한 고객이 받아요."
          : "주최자 공간으로 바꿨어요. 멤버가 다시 행사 사진을 받을 수 있어요.",
      );
      setConfirming(false);
    } catch (cause) {
      setDialogError(adminErrorMessage(cause, "공간 종류를 바꾸지 못했어요."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="hc-surface-card flex flex-col gap-3 rounded-2xl p-4">
      <div>
        <h3 className="text-[15px] font-bold">공간 종류</h3>
        <p className="mt-1 max-w-[65ch] text-[13px] text-(--hc-muted)">
          업체 공간은 멤버(직원)가 행사 사진을 받지 않고, 링크를 받은 고객이 받아요. 주최자 공간은 행사를 연 분이
          사진을 받아요. 찍은 수·사용량 관리는 둘 다 돼요.
        </p>
      </div>
      <AdminSearchField
        kind="workspace"
        onPick={(w) => {
          setPicked(w);
          setNotice(null);
        }}
      />
      {picked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--hc-border) px-3 py-3">
          <div className="min-w-0">
            <p className="break-words text-[14px] font-semibold">{picked.name}</p>
            <p className="break-all text-[12px] text-(--hc-muted)">
              {picked.workspaceId} · {isOrg ? `지금 ${KIND_LABEL[kind]} 공간` : "개인 공간"}
            </p>
          </div>
          {isOrg ? (
            <button
              type="button"
              onClick={() => {
                setDialogError(null);
                setConfirming(true);
              }}
              className="h-11 shrink-0 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold"
            >
              {KIND_LABEL[next]}로 바꾸기
            </button>
          ) : (
            <span className="shrink-0 text-[12px] text-(--hc-muted)">개인 공간은 늘 주최자예요.</span>
          )}
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="text-[13px]">
          {notice}
        </p>
      ) : null}
      {confirming && picked ? (
        <SingleFieldDialog
          title={next === "ENTERPRISE" ? "업체 공간으로 바꿀까요?" : "주최자 공간으로 바꿀까요?"}
          description={
            next === "ENTERPRISE"
              ? "이 공간의 멤버는 행사 사진을 받지 못하고, 링크를 받은 고객이 받아요. 이유는 감사 로그에 남아요."
              : "이 공간의 멤버가 다시 행사 사진을 받을 수 있어요. 이유는 감사 로그에 남아요."
          }
          submitLabel={`${KIND_LABEL[next]}로 바꾸기`}
          submittingLabel="바꾸는 중"
          label="바꾸는 이유"
          placeholder="예: ○○웨딩홀 계약"
          initialValue=""
          maxLength={500}
          saving={saving}
          error={dialogError}
          onClose={() => setConfirming(false)}
          onSubmit={(reason) => void submit(reason)}
        />
      ) : null}
    </section>
  );
}
