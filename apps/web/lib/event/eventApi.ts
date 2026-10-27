"use client";

import { sendEventRequest, type EventCredential } from "@/lib/event/eventTransport";
import type { TextPreview, TextStyle } from "@/lib/event/freeText";
import type {
  BoothCurrentRun,
  BoothMe,
  BoothPairing,
  CaptureRun,
  ComposeAccepted,
  ConsentDecision,
  DownloadUrl,
  ParticipantJob,
  ParticipantSessionIssued,
  ParticipantSessionState,
  ParticipantStatus,
  PublicEvent,
  ResultStatus,
  UploadIntent,
} from "@/lib/event/types";

/**
 * 행사 참가·부스·결과 수령 API. 경로는 BFF(app/api/client/…)이고, 백엔드 경로와 같은 모양이다.
 * 자격은 호출부가 넘긴다 — 이 모듈은 어디에도 보관하지 않는다(credentialStore 참고).
 */
const seg = encodeURIComponent;

const participant = (token: string): EventCredential => ({ kind: "participant", token });
const booth = (token: string): EventCredential => ({ kind: "booth", token });

// ── 공개 ──
export function getPublicEvent(slug: string, signal?: AbortSignal) {
  return sendEventRequest<PublicEvent>("GET", `/api/client/public/events/${seg(slug)}`, {
    signal,
    what: "행사 정보",
  });
}

/** 자유 문구 글꼴 목록(공개). Studio 가 행사에 줄 글꼴을 고를 때 쓴다. */
export function getTextStyles(signal?: AbortSignal) {
  return sendEventRequest<TextStyle[]>("GET", "/api/client/public/text-styles", { signal, what: "글꼴 목록" });
}

export function startByodSession(slug: string) {
  return sendEventRequest<ParticipantSessionIssued>(
    "POST",
    `/api/client/public/events/${seg(slug)}/sessions`,
    { body: { channel: "BYOD" }, what: "참가 세션" },
  );
}

// ── 참가자 ──
export function getParticipantSession(token: string, signal?: AbortSignal) {
  return sendEventRequest<ParticipantSessionState>("GET", "/api/client/participant/session", {
    credential: participant(token),
    signal,
    what: "참가 세션",
  });
}

export function submitConsents(
  token: string,
  eventId: string,
  items: { code: string; version: number; decision: ConsentDecision }[],
) {
  return sendEventRequest<{ status: ParticipantStatus }>(
    "POST",
    `/api/client/participant/events/${seg(eventId)}/consents`,
    { credential: participant(token), body: { items }, what: "참가 동의" },
  );
}

export function startCaptureRun(token: string, eventId: string) {
  return sendEventRequest<CaptureRun>(
    "POST",
    `/api/client/participant/events/${seg(eventId)}/capture-runs`,
    { credential: participant(token), what: "촬영 회차" },
  );
}

export function getEventFrameVersion(
  token: string,
  eventId: string,
  frameVersionId: number,
  captureRunId: string,
) {
  return sendEventRequest<unknown>(
    "GET",
    `/api/client/participant/events/${seg(eventId)}/frame-versions/${frameVersionId}?captureRunId=${seg(captureRunId)}`,
    { credential: participant(token), what: "행사 프레임" },
  );
}

export function createCaptureUploadIntent(
  token: string,
  eventId: string,
  input: { captureRunId: string; slotIndex: number; contentType: "JPEG" | "PNG"; fileSize: number },
) {
  return sendEventRequest<UploadIntent>(
    "POST",
    `/api/client/participant/events/${seg(eventId)}/upload-intents`,
    { credential: participant(token), body: input, what: "업로드 주소" },
  );
}

export function completeCaptureUpload(token: string, assetId: string) {
  return sendEventRequest<unknown>("POST", `/api/client/participant/assets/${seg(assetId)}/complete`, {
    credential: participant(token),
  });
}

export function submitEventCompose(
  token: string,
  eventId: string,
  input: {
    captureRunId: string;
    frameVersionId: number;
    sourceAssetIds: string[];
    idempotencyKey: string;
    /** 자유 문구 행사에서 참가자가 쓴 문구. 없으면 프레임 그대로 합성한다. */
    freeText?: { text: string; styleId: string };
  },
) {
  return sendEventRequest<ComposeAccepted>(
    "POST",
    `/api/client/participant/events/${seg(eventId)}/compose-jobs`,
    { credential: participant(token), body: input, what: "합성 접수" },
  );
}

/**
 * 자유 문구 미리보기 — 최종 합성과 같은 서버 렌더. 회차를 실어 그 회차에 고정된 행사 설정으로 그린다(촬영 중에
 * 다시 게시돼도 결과와 같게). 늦은 응답은 text·styleId 로 가려 버린다. 분당 30회 넘으면 429 GEN-061.
 */
export function previewFreeText(
  token: string,
  eventId: string,
  input: { captureRunId: string; frameVersionId: number; text: string; styleId: string },
  signal?: AbortSignal,
) {
  return sendEventRequest<TextPreview>(
    "POST",
    `/api/client/participant/events/${seg(eventId)}/text-preview`,
    { credential: participant(token), body: input, signal, what: "문구 미리보기" },
  );
}

export function getParticipantJob(token: string, jobId: number, signal?: AbortSignal) {
  return sendEventRequest<ParticipantJob>("GET", `/api/client/participant/compose-jobs/${jobId}`, {
    credential: participant(token),
    signal,
    what: "합성 상태",
  });
}

export function getParticipantDownload(token: string, jobId: number) {
  return sendEventRequest<DownloadUrl>("POST", `/api/client/participant/compose-jobs/${jobId}/download`, {
    credential: participant(token),
    what: "다운로드 주소",
  });
}

export function reissueResultAccess(token: string, jobId: number) {
  return sendEventRequest<{ resultToken: string; resultExpiresAt: string }>(
    "POST",
    `/api/client/participant/compose-jobs/${jobId}/result-access`,
    { credential: participant(token), what: "결과 링크" },
  );
}

export function listParticipantResults(token: string, eventId: string) {
  return sendEventRequest<ParticipantJob[]>(
    "GET",
    `/api/client/participant/events/${seg(eventId)}/results`,
    { credential: participant(token), what: "내 결과" },
  );
}

// ── 부스 ──
export function redeemBoothPairing(code: string) {
  return sendEventRequest<BoothPairing>("POST", "/api/client/public/booth-pairings/redeem", {
    body: { code },
    what: "부스 연결",
  });
}

export function getBoothMe(token: string, signal?: AbortSignal) {
  return sendEventRequest<BoothMe>("GET", "/api/client/booth/me", {
    credential: booth(token),
    signal,
    what: "부스 상태",
  });
}

export function startBoothGuest(token: string) {
  return sendEventRequest<ParticipantSessionIssued>("POST", "/api/client/booth/participant-sessions", {
    credential: booth(token),
    what: "손님 세션",
  });
}

/** 활성 회차가 없으면 서버는 200 에 data 키를 싣지 않는다 — 그때는 undefined 다(빈 응답이 정상이다). */
export function getBoothCurrentRun(token: string, version: number, signal?: AbortSignal) {
  return sendEventRequest<BoothCurrentRun | undefined>(
    "GET",
    `/api/client/booth/capture-runs/current?version=${version}`,
    { credential: booth(token), signal },
  );
}

export function closeBoothRun(token: string, captureRunId: string, stateVersion: number) {
  return sendEventRequest<unknown>(
    "POST",
    `/api/client/booth/capture-runs/${seg(captureRunId)}/close`,
    { credential: booth(token), body: { stateVersion } },
  );
}

// ── 결과 수령 ──
export function getResult(resultToken: string, signal?: AbortSignal) {
  return sendEventRequest<ResultStatus>("GET", "/api/client/public/results", {
    credential: { kind: "result", token: resultToken },
    signal,
    what: "결과",
  });
}

export function getResultDownload(resultToken: string) {
  return sendEventRequest<DownloadUrl>("POST", "/api/client/public/results/download", {
    credential: { kind: "result", token: resultToken },
    what: "다운로드 주소",
  });
}
