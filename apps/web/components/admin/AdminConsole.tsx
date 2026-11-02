"use client";

import { useState } from "react";
import { AppNav } from "@/components/layout/AppNav";
import { AuditLogList } from "@/components/audit/AuditLogList";
import { adminErrorMessage } from "@/components/admin/adminShared";
import { AdminContracts } from "@/components/admin/AdminContracts";
import { AdminEntitlements } from "@/components/admin/AdminEntitlements";
import { AdminFrames } from "@/components/admin/AdminFrames";
import { AdminInquiries } from "@/components/admin/AdminInquiries";
import { listAuditLogs } from "@/lib/admin/cmsApi";

const TABS = [
  { key: "inquiries", label: "문의" },
  { key: "contracts", label: "계약" },
  { key: "entitlements", label: "이용권" },
  { key: "frames", label: "시스템 프레임" },
  { key: "audit", label: "감사 로그" },
] as const;

const auditErrorMessage = (cause: unknown) => adminErrorMessage(cause, "감사 로그를 불러오지 못했어요.");

type TabKey = (typeof TABS)[number]["key"];

/**
 * 하루컷 플랫폼 CMS(R5 10절). 문의를 계약과 실제 이용권으로 잇는다. 플랫폼 ADMIN 만 쓴다 — 화면은 로그인만 보고,
 * 권한은 백엔드가 /api/admin/** 에서 본다(403 이면 각 탭이 「플랫폼 관리자만」으로 알린다).
 */
export function AdminConsole() {
  const [tab, setTab] = useState<TabKey>("inquiries");
  const [prefill, setPrefill] = useState<{ contractorName: string; nonce: number } | null>(null);
  const [entitlementsVersion, setEntitlementsVersion] = useState(0);

  return (
    <main className="hc-page-app min-h-dvh pb-16 text-(--hc-text)">
      <AppNav />
      <div className="mx-auto flex w-full max-w-200 flex-col gap-5 px-4 py-5 sm:py-6 lg:py-8">
        <h1 className="text-[30px] font-extrabold tracking-tight">운영 관리</h1>
        <div role="tablist" aria-label="운영 관리" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`admin-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`admin-panel-${t.key}`}
              onClick={() => {
                setTab(t.key);
                // 이용권 탭에 들어올 때마다 새로 받는다(다른 관리자가 바꿨을 수도 있다).
                if (t.key === "entitlements") setEntitlementsVersion((v) => v + 1);
              }}
              className={
                tab === t.key
                  // 고른 탭은 무채색이다. 초록은 「적용하기」 같은 주 동작이 쓴다.
                  ? "hc-button-ink h-11 rounded-full px-5 text-[14px] font-semibold"
                  : "h-11 rounded-full border border-(--hc-border) px-5 text-[14px] font-semibold"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* 세 패널을 모두 마운트해 두고 고르지 않은 것만 숨긴다 — 탭을 오가도 작성 중인 계약·이용권 초안이 남는다(Codex #546). */}
        <section role="tabpanel" id="admin-panel-inquiries" aria-labelledby="admin-tab-inquiries" hidden={tab !== "inquiries"}>
          <AdminInquiries
            onStartContract={(inquiry) => {
              setPrefill({ contractorName: inquiry.contactName, nonce: Date.now() });
              setTab("contracts");
            }}
          />
        </section>
        <section role="tabpanel" id="admin-panel-contracts" aria-labelledby="admin-tab-contracts" hidden={tab !== "contracts"}>
          <AdminContracts prefill={prefill} onContractChanged={() => setEntitlementsVersion((v) => v + 1)} />
        </section>
        <section role="tabpanel" id="admin-panel-entitlements" aria-labelledby="admin-tab-entitlements" hidden={tab !== "entitlements"}>
          <AdminEntitlements reloadKey={entitlementsVersion} />
        </section>
        {/* 아래 둘은 쓰던 초안이 없다. 열 때만 그려 안 보는 동안 서버에 묻지 않는다. */}
        {tab === "frames" ? (
          <section role="tabpanel" id="admin-panel-frames" aria-labelledby="admin-tab-frames">
            <AdminFrames />
          </section>
        ) : null}
        {tab === "audit" ? (
          <section role="tabpanel" id="admin-panel-audit" aria-labelledby="admin-tab-audit">
            <AuditLogList load={listAuditLogs} errorMessage={auditErrorMessage} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
