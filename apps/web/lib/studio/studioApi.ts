"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";

/**
 * 고객용 Studio 의 운영자 API(ADR-0007 §3·§4, 백엔드 fork develop #15).
 *
 * 권한은 서버가 조직 공간 역할(OWNER·ADMIN)로 본다. 이 모듈은 화면이 고를 수 있는 것만 다루고,
 * 버튼을 숨긴다고 권한이 생기지 않는다.
 */
export type WorkspaceRole = "OWNER" | "ADMIN" | "DESIGNER" | "VIEWER";

export type Workspace = {
  workspaceId: string;
  name: string;
  type: "PERSONAL" | "ORGANIZATION";
  role: WorkspaceRole;
};

export type EventLayout = "CLASSIC" | "WIDE" | "GRID" | "POLAROID";

export type ConsentItem = {
  code: string;
  title: string;
  body: string;
  required: boolean;
  /** 문구를 바꾸면 올린다 — 참가자 동의 기록이 어느 문구에 대한 것인지 가린다. */
  version: number;
};

export type FrameRef = {
  frameVersionId: number;
  layoutType: EventLayout;
  isDefault: boolean;
  sortOrder: number;
};

export type EventSettings = {
  name?: string | null;
  /** `/e/{slug}`. 영문 소문자·숫자·하이픈 3~40자. **게시 후에는 바꿀 수 없다.** */
  slug?: string | null;
  timezone?: string | null;
  /** 없으면 게시 즉시. offset 이 붙은 ISO-8601. */
  captureStartsAt?: string | null;
  /** 없으면 상시형 — 「촬영 종료」로 끝낸다. */
  captureEndsAt?: string | null;
  byodEnabled?: boolean | null;
  boothEnabled?: boolean | null;
  allowedLayouts?: EventLayout[] | null;
  frames?: FrameRef[] | null;
  consentItems?: ConsentItem[] | null;
  resultRetentionDays?: number | null;
  /** P2A 는 자리표시자 — 서버는 해석하지 않는다. */
  theme?: unknown;
};

export type EventStatus = "DRAFT" | "LIVE" | "CAPTURE_CLOSED" | "ARCHIVED";

export type StudioEvent = {
  eventId: string;
  workspaceId: string;
  status: EventStatus;
  paused: boolean;
  /** 지금 새 참가·촬영을 받는가(LIVE·중지 아님·촬영 기간 안). */
  captureOpen: boolean;
  /** PATCH 에 그대로 보낼 낙관적 잠금 값. */
  settingsVersion: number;
  settings: EventSettings;
  /** 게시 전이면 null. */
  currentExperienceVersion: number | null;
  /** 항상 오리진 없는 `/e/{slug}` — 서버는 프론트 도메인을 모른다. */
  joinUrlPath: string;
};

export type EventAction = "publish" | "pause" | "resume" | "close-capture";

/** 게시 검증 위반(400 EVENT-003 의 data.violations). 서버가 하나에서 멈추지 않고 모두 모은다. */
export type PublishViolation = { field: string; reason: string };

export const EVENT_SETTINGS_CONFLICT_CODE = "EVENT-005";
export const EVENT_PUBLISH_INVALID_CODE = "EVENT-003";

export async function listWorkspaces(): Promise<Workspace[]> {
  const res = await clientApi.get<ApiEnvelope<Workspace[]>>("/api/client/workspaces");
  return res.data.data ?? [];
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const res = await clientApi.post<ApiEnvelope<Workspace>>("/api/client/workspaces", { name });
  return requireData(res.data, "공간");
}

export async function listEvents(workspaceId: string): Promise<StudioEvent[]> {
  const res = await clientApi.get<ApiEnvelope<StudioEvent[]>>(
    `/api/client/workspaces/${encodeURIComponent(workspaceId)}/events`,
  );
  return res.data.data ?? [];
}

export async function createEvent(workspaceId: string, settings: EventSettings): Promise<StudioEvent> {
  const res = await clientApi.post<ApiEnvelope<StudioEvent>>(
    `/api/client/workspaces/${encodeURIComponent(workspaceId)}/events`,
    settings,
  );
  return requireData(res.data, "행사");
}

export async function getEvent(eventId: string): Promise<StudioEvent> {
  const res = await clientApi.get<ApiEnvelope<StudioEvent>>(`/api/client/events/${encodeURIComponent(eventId)}`);
  return requireData(res.data, "행사");
}

/** 보낸 필드만 바뀐다(null 이면 그 값을 비운다). 다른 곳이 먼저 바꿨으면 409 EVENT-005. */
export async function updateEventSettings(
  eventId: string,
  settingsVersion: number,
  settings: EventSettings,
): Promise<StudioEvent> {
  const res = await clientApi.patch<ApiEnvelope<StudioEvent>>(
    `/api/client/events/${encodeURIComponent(eventId)}`,
    { settingsVersion, settings },
  );
  return requireData(res.data, "행사");
}

export async function runEventAction(eventId: string, action: EventAction): Promise<StudioEvent> {
  const res = await clientApi.post<ApiEnvelope<StudioEvent>>(
    `/api/client/events/${encodeURIComponent(eventId)}/${action}`,
  );
  return requireData(res.data, "행사");
}

/** 409 EVENT-005 의 서버 현재 값. 없으면 null. */
export function conflictSettingsVersion(error: unknown): number | null {
  const data = (error as { data?: { data?: { currentSettingsVersion?: unknown } } }).data?.data;
  return typeof data?.currentSettingsVersion === "number" ? data.currentSettingsVersion : null;
}

/** 400 EVENT-003 의 위반 목록. 모양이 다르면 빈 배열. */
export function publishViolations(error: unknown): PublishViolation[] {
  const data = (error as { data?: { data?: { violations?: unknown } } }).data?.data;
  if (!Array.isArray(data?.violations)) return [];
  return data.violations.filter(
    (v): v is PublishViolation =>
      Boolean(v) && typeof v.field === "string" && typeof v.reason === "string",
  );
}
