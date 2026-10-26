"use client";

import { useState } from "react";
import { AppNav } from "@/components/layout/AppNav";
import { AdminContracts } from "@/components/admin/AdminContracts";
import { AdminEntitlements } from "@/components/admin/AdminEntitlements";
import { AdminInquiries } from "@/components/admin/AdminInquiries";

const TABS = [
  { key: "inquiries", label: "문의" },
  { key: "contracts", label: "계약" },
  { key: "entitlements", label: "이용권" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * 하루컷 플랫폼 CMS(R5 10절). 문의를 계약과 실제 이용권으로 잇는다. 플랫폼 ADMIN 만 쓴다 — 화면은 로그인만 보고,
 * 권한은 백엔드가 /api/admin/** 에서 본다(403 이면 각 탭이 「플랫폼 관리자만」으로 알린다).
 */
export function AdminConsole() {
  const [tab, setTab] = useState<TabKey>("inquiries");
  const [prefill, setPrefill] = useState<{ contractorName: string; nonce: number } | null>(null);

  return (
    <main className="hc-page-app min-h-dvh pb-16 text-(--hc-text)">
      <AppNav />
      <div className="mx-auto flex w-full max-w-200 flex-col gap-5 px-4 py-5 sm:py-6 lg:py-8">
        <h1 className="text-[30px] font-extrabold tracking-tight">운영 관리</h1>
        <div role="tablist" aria-label="운영 관리" className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`admin-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`admin-panel-${t.key}`}
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "hc-button-primary h-11 rounded-full px-5 text-[14px] font-semibold"
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
          <AdminContracts prefill={prefill} />
        </section>
        <section role="tabpanel" id="admin-panel-entitlements" aria-labelledby="admin-tab-entitlements" hidden={tab !== "entitlements"}>
          <AdminEntitlements />
        </section>
      </div>
    </main>
  );
}
