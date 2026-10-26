import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";
import { clientApi } from "@/lib/clientApi";
import type { EntitlementFeature } from "@/lib/studio/usageApi";

/**
 * 하루컷 플랫폼 CMS(ADR-0008 §6-1, R5 10절). 문의 → 계약 → 이용권으로 잇는 운영 도구다.
 * 플랫폼 ADMIN 만 쓴다 — 백엔드가 /api/admin/** 전체에 ADMIN 을 요구한다. 고객 Studio 의 공간 관리자 역할과 다르다.
 */
export type InquiryStatus = "NEW" | "CONTACTED" | "QUOTED" | "WON" | "LOST";

export type Inquiry = {
  inquiryId: string;
  contactName: string;
  email: string;
  phone?: string | null;
  organizerType: "PERSONAL" | "BUSINESS";
  /** 서버가 이어 붙인 문자열(예: "BYOD,BOOTH"). */
  channels: string;
  expectedDate?: string | null;
  expectedCount?: number | null;
  message: string;
  status: InquiryStatus;
  assigneeNote?: string | null;
  createdAt: string;
};

export type EntitlementTerms = {
  composeQuota: number;
  retentionDays?: number;
  maxBoothDevices?: number;
  maxLiveEvents?: number;
  features?: EntitlementFeature[];
};

export type ContractStatus = "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
export type EntitlementScope = "WORKSPACE" | "EVENT";

export type PaymentEvidence = { kind: "PORTONE" | "BANK_TRANSFER" | "OTHER"; reference: string };

export type ContractRequest = {
  workspaceId: string;
  contractorName: string;
  scope: EntitlementScope;
  eventIds?: string[];
  amount?: number;
  currency?: string;
  startsAt: string;
  endsAt: string;
  paymentEvidence?: PaymentEvidence;
  entitlement: EntitlementTerms;
};

export type Contract = ContractRequest & {
  contractId: string;
  status: ContractStatus;
  createdAt: string;
  /** 결제 근거(PORTONE)를 PortOne 조회로 대조해 확인한 시각. 없으면 아직 확인 전. */
  paymentVerifiedAt?: string | null;
};

/** 계약 대상 찾기 — 조직 공간만 나온다(개인 공간은 계약 대상이 아니다). 최신순 최대 20건. */
export type AdminWorkspaceItem = {
  workspaceId: string;
  name: string;
  type: "PERSONAL" | "ORGANIZATION";
  ownerEmails: string[];
  createdAt: string;
};

export type AdminEventItem = {
  eventId: string;
  slug: string;
  name: string;
  status: "DRAFT" | "LIVE" | "CAPTURE_CLOSED" | "ARCHIVED";
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
};

/** 검색어는 두 글자 이상이어야 한다(아니면 400 GEN-002). */
export const ADMIN_SEARCH_MIN = 2;

export type Entitlement = {
  entitlementId: string;
  scope: EntitlementScope;
  workspaceId: string;
  eventId?: string | null;
  source: "CONTRACT" | "MANUAL";
  contractId?: string | null;
  status: "ACTIVE" | "REVOKED";
  terms: EntitlementTerms;
  used: number;
  reserved: number;
  validFrom: string;
  validTo: string;
  grantorNote?: string | null;
  revokeReason?: string | null;
};

export type ManualGrantRequest = {
  workspaceId: string;
  /** 있으면 행사 범위. */
  eventId?: string;
  grantorNote: string;
  validFrom: string;
  validTo: string;
  terms: EntitlementTerms;
};

export type EntitlementImpact = { liveEvents: string[]; openReservations: number };


export async function listInquiries(): Promise<Inquiry[]> {
  const res = await clientApi.get<ApiEnvelope<Inquiry[]>>(`/api/client/admin/inquiries`);
  return res.data.data ?? [];
}

export async function updateInquiry(
  inquiryId: string,
  patch: { status?: InquiryStatus; assigneeNote?: string },
): Promise<Inquiry> {
  const res = await clientApi.patch<ApiEnvelope<Inquiry>>(`/api/client/admin/inquiries/${encodeURIComponent(inquiryId)}`, patch);
  return requireData(res.data, "문의");
}

export async function listContracts(): Promise<Contract[]> {
  const res = await clientApi.get<ApiEnvelope<Contract[]>>(`/api/client/admin/contracts`);
  return res.data.data ?? [];
}

export async function createContract(contract: ContractRequest): Promise<Contract> {
  const res = await clientApi.post<ApiEnvelope<Contract>>(`/api/client/admin/contracts`, contract);
  return requireData(res.data, "계약");
}

/** DRAFT→ACTIVE(이용권 생성)·CANCELLED, ACTIVE→ENDED·CANCELLED. 나머지는 409 ENT-003. */
export async function changeContractStatus(
  contractId: string,
  status: ContractStatus,
  signal?: AbortSignal,
): Promise<Contract> {
  const res = await clientApi.patch<ApiEnvelope<Contract>>(
    `/api/client/admin/contracts/${encodeURIComponent(contractId)}`,
    { status },
    { signal },
  );
  return requireData(res.data, "계약");
}

/**
 * PORTONE 근거를 PortOne 조회로 다시 대조한다(웹훅이 근거 등록보다 먼저 와서 확인되지 않은 계약용).
 * 맞으면 paymentVerifiedAt 이 채워진 계약. 근거 없음·연동 꺼짐·불일치는 400 GEN-002. 실연동 미확인.
 */
export async function verifyContractPayment(contractId: string, signal?: AbortSignal): Promise<Contract> {
  const res = await clientApi.post<ApiEnvelope<Contract>>(
    `/api/client/admin/contracts/${encodeURIComponent(contractId)}/payment-verification`,
    undefined,
    { signal },
  );
  return requireData(res.data, "계약");
}

export async function listEntitlements(): Promise<Entitlement[]> {
  const res = await clientApi.get<ApiEnvelope<Entitlement[]>>(`/api/client/admin/entitlements`);
  return res.data.data ?? [];
}

export async function grantEntitlement(grant: ManualGrantRequest): Promise<Entitlement> {
  const res = await clientApi.post<ApiEnvelope<Entitlement>>(`/api/client/admin/entitlements`, grant);
  return requireData(res.data, "이용권");
}

export async function getEntitlementImpact(entitlementId: string): Promise<EntitlementImpact> {
  const res = await clientApi.get<ApiEnvelope<EntitlementImpact>>(
    `/api/client/admin/entitlements/${encodeURIComponent(entitlementId)}/impact`,
  );
  return requireData(res.data, "회수 영향");
}

export async function revokeEntitlement(entitlementId: string, reason: string): Promise<Entitlement> {
  const res = await clientApi.post<ApiEnvelope<Entitlement>>(
    `/api/client/admin/entitlements/${encodeURIComponent(entitlementId)}/revoke`,
    { reason },
  );
  return requireData(res.data, "이용권");
}

export async function searchWorkspaces(query: string): Promise<AdminWorkspaceItem[]> {
  const res = await clientApi.get<ApiEnvelope<AdminWorkspaceItem[]>>(
    `/api/client/admin/workspaces?query=${encodeURIComponent(query)}`,
  );
  return res.data.data ?? [];
}

export async function searchEvents(query: string): Promise<AdminEventItem[]> {
  const res = await clientApi.get<ApiEnvelope<AdminEventItem[]>>(
    `/api/client/admin/events?query=${encodeURIComponent(query)}`,
  );
  return res.data.data ?? [];
}
