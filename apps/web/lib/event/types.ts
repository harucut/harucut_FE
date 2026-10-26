/**
 * 행사 참가·부스·결과 수령 API 의 응답 모양(ADR-0007 · §12 구현 반영). 정본은 harucut/Harucut 의
 * docs/api/openapi.generated.json 이다 — p2a 초안은 더 고치지 않는다(백엔드 fork #21).
 * 계약이 바뀌면 이 파일과 BFF(app/api/client/{public,participant,booth}/**)를 함께 고친다.
 */
export type LayoutType = "CLASSIC" | "WIDE" | "GRID" | "POLAROID";
export type EventStatus = "DRAFT" | "LIVE" | "CAPTURE_CLOSED" | "ARCHIVED";
export type JobStatus = "PENDING" | "DONE" | "FAILED";
export type ParticipantStatus = "RESTRICTED" | "ACTIVE";
export type ConsentDecision = "AGREED" | "DECLINED" | "WITHDRAWN";

export type EventFrameRef = {
  frameVersionId: number;
  layoutType: LayoutType;
  sortOrder: number;
  isDefault: boolean;
  previewUrl?: string;
};

export type ConsentItem = {
  code: string;
  version: number;
  title: string;
  required: boolean;
  /** 사진 수신 주체·목적·보관 안내 본문 */
  body?: string;
};

/** P2A 는 자리만 있다. 페이지 테마 스키마는 P2B 에서 정한다. */
export type EventTheme = Record<string, unknown>;

export type PublicEvent = {
  eventId: string;
  name: string;
  status: EventStatus;
  captureOpen: boolean;
  byodEnabled: boolean;
  boothEnabled: boolean;
  experienceVersion: number;
  allowedLayouts: LayoutType[];
  frames: EventFrameRef[];
  consentItems: ConsentItem[];
  theme?: EventTheme;
};

export type ParticipantSessionIssued = {
  participantToken: string;
  participantId: string;
  status?: ParticipantStatus;
  expiresAt: string;
};

export type ParticipantSessionState = {
  participantId: string;
  eventId: string;
  eventSlug: string;
  channel: "BYOD" | "BOOTH";
  status: ParticipantStatus;
  expiresAt: string;
  pendingConsents: { code: string; version: number }[];
  activeCaptureRun: { captureRunId: string; stateVersion: number; expiresAt: string } | null;
};

export type CaptureRun = {
  captureRunId: string;
  experienceVersion: number;
  stateVersion: number;
  expiresAt: string;
};

export type UploadIntent = {
  assetId: string;
  uploadUrl: string;
  method: "PUT";
  /** 서명에 들어간 헤더. 그대로 보낸다(If-None-Match 는 서버 설정에 따라 있을 수도 없을 수도 있다). */
  headers: Record<string, string>;
  expiresAt: string;
};

export type ComposeAccepted = {
  jobId: number;
  status: JobStatus;
  resultToken: string;
  resultExpiresAt: string;
};

export type ParticipantJob = {
  jobId: number;
  status: JobStatus;
};

export type DownloadUrl = { url: string; expiresAt: string };

export type BoothPairing = { boothToken: string; deviceId: string; eventId: string };

export type BoothMe = {
  deviceId: string;
  name?: string;
  status: string;
  /** 게시 전이거나 보관이 끝났으면 키가 없다 — 「대기」로 보여 준다. */
  event?: PublicEvent | null;
};

/**
 * 결과 토큰은 싣지 않는다 — 서버는 해시만 저장해 원문을 다시 못 보여 준다. 부스는 합성 접수 응답의
 * 토큰을 QR 에 쓴다(부스가 곧 그 참가자 클라이언트다).
 */
export type BoothCurrentRun = {
  captureRunId: string;
  stateVersion: number;
  status: string;
  /** 요청한 version 이 서버 stateVersion 과 다르면 싣지 않는다. */
  job?: ParticipantJob | null;
};

export type ResultStatus = {
  status: JobStatus | "EXPIRED";
  eventName: string;
  thumbnailUrl: string | null;
  expiresAt: string;
  theme?: EventTheme;
};
