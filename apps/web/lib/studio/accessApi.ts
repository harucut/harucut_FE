"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";
import type { AuditLogPage } from "@/components/audit/AuditLogList";
import type { WorkspaceRole } from "@/lib/studio/studioApi";

/**
 * 공간 멤버·행사 고객 초대와 행사 사진 권한(ADR-0008 §2, 백엔드 fork #23).
 *
 * 초대는 메일 없이 링크로 건넨다(`/invite#<token>`). 토큰 원문은 발급 응답에서 한 번만 받는다 —
 * 서버는 해시만 둔다. 링크를 놓치면 새로 발급한다.
 */
export type EventPermission = "VIEW_PHOTOS" | "DOWNLOAD_PHOTOS" | "BULK_DOWNLOAD" | "DELETE_PHOTOS";

export const EVENT_PERMISSIONS: EventPermission[] = ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS", "BULK_DOWNLOAD", "DELETE_PHOTOS"];

export const PERMISSION_LABEL: Record<EventPermission, string> = {
  VIEW_PHOTOS: "사진 보기",
  DOWNLOAD_PHOTOS: "사진 내려받기",
  BULK_DOWNLOAD: "한꺼번에 내려받기",
  DELETE_PHOTOS: "사진 지우기",
};

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  OWNER: "소유자",
  ADMIN: "관리자",
  OPERATOR: "운영 담당",
  DESIGNER: "디자이너",
  VIEWER: "보기 전용",
};

export type InvitationKind = "WORKSPACE" | "EVENT";

export type InvitationIssued = { invitationId: string; inviteToken: string; expiresAt: string };

export type Invitation = {
  invitationId: string;
  kind: InvitationKind;
  status: "OPEN" | "ACCEPTED" | "REVOKED";
  role?: WorkspaceRole;
  eventId?: string;
  permissions?: EventPermission[];
  email?: string;
  note?: string;
  expiresAt: string;
};

export type InvitationPreview = {
  kind: InvitationKind;
  workspaceName: string;
  eventName?: string;
  role?: WorkspaceRole;
  permissions?: EventPermission[];
  invitedByName: string;
  expiresAt: string;
  /** 행사 고객 초대가 이미 찍은 사진까지 보여 주는지. false 면 수락한 뒤 사진만. 옛 서버면 키가 없다. */
  includePast?: boolean;
};

export type InvitationAccepted = {
  kind: InvitationKind;
  workspaceId?: string;
  eventId?: string;
  role?: WorkspaceRole;
  permissions?: EventPermission[];
};

export type Member = { userId: string; name: string; role: WorkspaceRole; joinedAt: string };

/** 운영 권한(ADR-0009 §3). OWNER·ADMIN 은 셋 다, OPERATOR 는 배정받은 것만. 사진 권한과 따로다. */
export type EventOperation = "MANAGE_EVENT" | "MANAGE_BOOTH" | "INVITE_CUSTOMERS";

export const EVENT_OPERATIONS: EventOperation[] = ["MANAGE_EVENT", "MANAGE_BOOTH", "INVITE_CUSTOMERS"];

export const OPERATION_LABEL: Record<EventOperation, string> = {
  MANAGE_EVENT: "행사 설정·게시",
  MANAGE_BOOTH: "부스 기기",
  INVITE_CUSTOMERS: "고객 초대·사진 권한",
};

/**
 * 공간 디자이너가 받는 권한. 행사의 꾸미기와 프레임 고르기만 고치고 게시는 못 한다. 역할에서 자동으로 오므로
 * 행마다 배정하는 목록(EVENT_OPERATIONS)에는 넣지 않는다.
 */
export type EventAccessOperation = EventOperation | "EDIT_THEME";

/** 행사 고객은 operations 가 빈 목록이다. 운영자 배정 행은 사진 권한 없이 운영 권한만 가질 수 있다. */
export type EventGrant = {
  grantId: number;
  userId: string;
  name: string;
  permissions: EventPermission[];
  operations?: EventOperation[];
  createdAt: string;
  /** 이 시각 뒤에 찍은 사진만 본다. 없거나 null 이면 제한 없음. */
  photosFrom?: string | null;
};

export type MyEvent = {
  eventId: string;
  name: string;
  status: "DRAFT" | "LIVE" | "CAPTURE_CLOSED" | "ARCHIVED";
  /** 완성 사진 수. 삭제·보관 종료 제외. 옛 서버면 키가 없고, 디자이너 행에도 없다. */
  completedPhotoCount?: number;
  /** 이 행사가 속한 공간. 옛 서버면 키가 없다. */
  workspaceId?: string;
  /** role 이 있으면 공간 멤버로서 운영하는 행사, 없으면 고객으로 권한만 받은 행사. */
  access: {
    role?: WorkspaceRole;
    permissions: EventPermission[];
    /** 운영 권한. OWNER·ADMIN 은 전부, DESIGNER 는 EDIT_THEME 만, 고객은 빈 목록(옛 서버면 키가 없다). */
    operations?: EventAccessOperation[];
    /** OPERATOR 만 — 권한마다 행사 배정(EVENT)·프로젝트 멤버(PROJECT)·둘 다(BOTH). */
    sources?: Record<string, "EVENT" | "PROJECT" | "BOTH">;
    /** 행사 고객의 사진 범위. 이 시각 뒤에 찍은 사진만 본다. 없거나 null 이면 제한 없음. */
    photosFrom?: string | null;
  };
};

/** 꾸미기와 프레임 고르기만 고치는 사람(공간 디자이너). 서버와 같은 판정이다 — EDIT_THEME 이 있고 MANAGE_EVENT 가 없다. */
export function isThemeOnlyAccess(access: Pick<MyEvent["access"], "operations"> | null | undefined) {
  const operations = access?.operations ?? [];
  return operations.includes("EDIT_THEME") && !operations.includes("MANAGE_EVENT");
}

const ws = (workspaceId: string) => `/api/client/workspaces/${encodeURIComponent(workspaceId)}`;
const ev = (eventId: string) => `/api/client/events/${encodeURIComponent(eventId)}`;

export async function inviteMember(workspaceId: string, role: WorkspaceRole, email?: string) {
  const res = await clientApi.post<ApiEnvelope<InvitationIssued>>(`${ws(workspaceId)}/invitations`, {
    role,
    ...(email ? { email } : {}),
  });
  return requireData(res.data, "초대");
}

export async function listInvitations(workspaceId: string): Promise<Invitation[]> {
  const res = await clientApi.get<ApiEnvelope<Invitation[]>>(`${ws(workspaceId)}/invitations`);
  return res.data.data ?? [];
}

export async function revokeInvitation(workspaceId: string, invitationId: string) {
  await clientApi.post(`${ws(workspaceId)}/invitations/${encodeURIComponent(invitationId)}/revoke`);
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  const res = await clientApi.get<ApiEnvelope<Member[]>>(`${ws(workspaceId)}/members`);
  return res.data.data ?? [];
}

export async function changeMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  const res = await clientApi.patch<ApiEnvelope<Member>>(`${ws(workspaceId)}/members/${encodeURIComponent(userId)}`, { role });
  return requireData(res.data, "멤버");
}

/** userId 가 `me` 면 본인이 공간을 나간다. */
export async function removeMember(workspaceId: string, userId: string | "me") {
  await clientApi.delete(`${ws(workspaceId)}/members/${encodeURIComponent(userId)}`);
}

/** includePast 를 켜지 않으면 받는 사람은 수락한 뒤에 찍은 사진만 본다. */
export async function inviteEventCustomer(eventId: string, permissions: EventPermission[], note?: string, includePast = false) {
  const res = await clientApi.post<ApiEnvelope<InvitationIssued>>(`${ev(eventId)}/invitations`, {
    permissions,
    ...(note ? { note } : {}),
    ...(includePast ? { includePast: true } : {}),
  });
  return requireData(res.data, "초대");
}

export async function listEventGrants(eventId: string): Promise<EventGrant[]> {
  const res = await clientApi.get<ApiEnvelope<EventGrant[]>>(`${ev(eventId)}/grants`);
  return res.data.data ?? [];
}

/** 권한 집합을 통째로 바꾼다. includePast 를 함께 주면 이미 찍은 사진까지 볼 수 있게 넓힌다(감사 로그에 남는다). */
export async function updateEventGrant(eventId: string, grantId: number, permissions: EventPermission[], includePast = false) {
  const res = await clientApi.patch<ApiEnvelope<EventGrant>>(`${ev(eventId)}/grants/${grantId}`, {
    permissions,
    ...(includePast ? { includePast: true } : {}),
  });
  return requireData(res.data, "권한");
}

export async function removeEventGrant(eventId: string, grantId: number) {
  await clientApi.delete(`${ev(eventId)}/grants/${grantId}`);
}

/** 행사 운영자 배정(OWNER·ADMIN). 운영 권한 집합을 통째로 바꾸고, 빈 목록이면 뺀다. 대상은 이 공간의 OPERATOR 멤버. */
export async function assignEventOperator(eventId: string, userId: string, operations: EventOperation[]): Promise<EventGrant> {
  const res = await clientApi.put<ApiEnvelope<EventGrant>>(`${ev(eventId)}/operators/${encodeURIComponent(userId)}`, {
    operations,
  });
  return requireData(res.data, "운영자");
}

export async function listMyEvents(): Promise<MyEvent[]> {
  const res = await clientApi.get<ApiEnvelope<MyEvent[]>>("/api/client/me/events");
  return res.data.data ?? [];
}

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const res = await clientApi.post<ApiEnvelope<InvitationPreview>>("/api/client/invitations/preview", { token });
  return requireData(res.data, "초대");
}

export async function acceptInvitation(token: string): Promise<InvitationAccepted> {
  const res = await clientApi.post<ApiEnvelope<InvitationAccepted>>("/api/client/invitations/accept", { token });
  return requireData(res.data, "초대");
}

/** 초대 링크. 토큰은 fragment 에 둔다 — 서버 접근 로그·리퍼러에 남지 않는다. */
export function inviteLink(origin: string, token: string) {
  return `${origin}/invite#${token}`;
}

/** 공간 감사 로그(OWNER·ADMIN). 최신순 50개씩. */
export async function listWorkspaceAuditLogs(workspaceId: string, cursor: string | null): Promise<AuditLogPage> {
  const query = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : "";
  const res = await clientApi.get<ApiEnvelope<AuditLogPage>>(
    `/api/client/workspaces/${encodeURIComponent(workspaceId)}/audit-logs${query}`,
  );
  return res.data.data ?? { items: [] };
}
