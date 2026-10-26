"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, RemoteFrame } from "@/lib/api-types";
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

// ── 행사 제공 프레임 (백엔드 fork #18) ──

/** 행사에 고를 수 있는 발행본. 프레임마다 최신 발행본 하나, 공간 프레임이 먼저·시스템 프레임이 다음. */
export type PickableFrameVersion = {
  frameVersionId: number;
  frameId: number;
  versionNo: number;
  frameType: EventLayout;
  /** 원본 프레임의 지금 제목. */
  title: string;
  /** 원본 프레임 미리보기(24시간). 참고용이라 발행본과 다를 수 있다. */
  previewUrl?: string | null;
  source: "SYSTEM" | "WORKSPACE";
  publishedAt: string;
};

export async function listWorkspaceFrames(workspaceId: string): Promise<RemoteFrame[]> {
  const res = await clientApi.get<ApiEnvelope<RemoteFrame[]>>(
    `/api/client/workspaces/${encodeURIComponent(workspaceId)}/frames`,
  );
  return res.data.data ?? [];
}

export async function listPickableFrameVersions(workspaceId: string): Promise<PickableFrameVersion[]> {
  const res = await clientApi.get<ApiEnvelope<PickableFrameVersion[]>>(
    `/api/client/workspaces/${encodeURIComponent(workspaceId)}/frame-versions`,
  );
  return res.data.data ?? [];
}

/** 지금 저장된 프레임을 발행본으로 고정한다. 정적 스티커·구운 PNG 없는 글자가 남아 있으면 400 GEN-002. */
export async function publishFrameVersion(frameId: number): Promise<{ frameVersionId: number; versionNo: number }> {
  const res = await clientApi.post<ApiEnvelope<{ frameVersionId: number; versionNo: number }>>(
    `/api/client/user/frame/${frameId}/versions`,
  );
  return requireData(res.data, "발행본");
}

// ── 부스 기기 (백엔드 fork #19) ──

export type BoothDeviceStatus = "PENDING_PAIRING" | "ACTIVE" | "REVOKED";

export type BoothDevice = {
  deviceId: string;
  name: string;
  status: BoothDeviceStatus;
  /** 만들 때·재발급할 때만 실린다(XXXX-XXXX, 10분). 목록에는 없다 — 다시 보려면 재발급한다. */
  pairingCode?: string;
  pairingExpiresAt?: string;
  lastSeenAt?: string | null;
};

/** 행사당 회수되지 않은 기기 상한(백엔드 설정 기본값). 넘으면 403 BOOTH-006. */
export const MAX_BOOTH_DEVICES = 20;
export const BOOTH_DEVICE_NAME_MAX = 50;

export async function listBoothDevices(eventId: string, signal?: AbortSignal): Promise<BoothDevice[]> {
  const res = await clientApi.get<ApiEnvelope<BoothDevice[]>>(
    `/api/client/events/${encodeURIComponent(eventId)}/booth-devices`,
    { signal },
  );
  return res.data.data ?? [];
}

export async function createBoothDevice(eventId: string, name: string): Promise<BoothDevice> {
  const res = await clientApi.post<ApiEnvelope<BoothDevice>>(
    `/api/client/events/${encodeURIComponent(eventId)}/booth-devices`,
    { name },
  );
  return requireData(res.data, "부스 기기");
}

/** 새 연결 코드. 이전 코드는 닫히고, 이미 연결된 기기는 새 코드가 쓰이는 순간 끊긴다(기기 교체). */
export async function reissuePairingCode(deviceId: string, signal?: AbortSignal): Promise<BoothDevice> {
  const res = await clientApi.post<ApiEnvelope<BoothDevice>>(
    `/api/client/booth-devices/${encodeURIComponent(deviceId)}/pairing-codes`,
    undefined,
    { signal },
  );
  return requireData(res.data, "연결 코드");
}

/** 되돌릴 수 없다 — 기기 토큰·열린 코드·진행 중 회차·그 기기의 손님 세션이 모두 닫힌다. */
export async function revokeBoothDevice(deviceId: string, signal?: AbortSignal): Promise<BoothDevice> {
  const res = await clientApi.post<ApiEnvelope<BoothDevice>>(
    `/api/client/booth-devices/${encodeURIComponent(deviceId)}/revoke`,
    undefined,
    { signal },
  );
  return requireData(res.data, "부스 기기");
}
