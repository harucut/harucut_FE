"use client";

import { ApiRequestError } from "@/lib/clientApi";
import { getApiErrorDetails } from "@/lib/apiError";
import { completeCaptureUpload, createCaptureUploadIntent } from "@/lib/event/eventApi";

/** 브라우저가 스스로 정하는 헤더. 서명에 들어 있어도 직접 넣지 않는다(넣으면 무시되거나 요청이 깨진다). */
const BROWSER_MANAGED = new Set(["host", "content-length"]);
/** 검증 대기(ASSET-006, 503)일 때 같은 complete 를 다시 부르는 간격과 횟수. */
const COMPLETE_RETRY_MS = [1_500, 3_000, 6_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 이번 회차에서 찍은 한 장을 행사 촬영 입력(CAPTURE_INPUT)으로 올리고 검증까지 마친다.
 * 돌려주는 assetId 로 합성을 접수한다.
 *
 *  - S3 PUT 은 서버가 준 headers 를 그대로 보낸다. If-None-Match 가 있으면 같은 key 에 두 번 쓸 수 없다.
 *  - PUT 이 412 면 앞선 시도가 이미 올린 것이다 — 무조건 성공으로 보지 않고 complete 가 실제 객체를
 *    검증하게 둔다(기획 R5 16절). 조건 헤더를 빼고 다시 보내는 우회는 하지 않는다.
 *  - 쿠키·회원 Authorization 을 S3 로 보내지 않는다(credentials: "omit").
 */
export async function uploadCaptureInput(args: {
  token: string;
  eventId: string;
  captureRunId: string;
  slotIndex: number;
  photo: Blob;
}): Promise<string> {
  const intent = await createCaptureUploadIntent(args.token, args.eventId, {
    captureRunId: args.captureRunId,
    slotIndex: args.slotIndex,
    contentType: "JPEG",
    fileSize: args.photo.size,
  });

  const headers = new Headers();
  for (const [name, value] of Object.entries(intent.headers ?? {})) {
    if (!BROWSER_MANAGED.has(name.toLowerCase())) headers.set(name, value);
  }
  let put: Response;
  try {
    put = await fetch(intent.uploadUrl, {
      method: intent.method ?? "PUT",
      headers,
      body: args.photo,
      credentials: "omit",
    });
  } catch {
    throw new ApiRequestError({ code: "CLIENT-004", apiMessage: null });
  }
  if (!put.ok && put.status !== 412) {
    throw new ApiRequestError({ status: put.status, code: undefined, apiMessage: null });
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      await completeCaptureUpload(args.token, intent.assetId);
      return intent.assetId;
    } catch (error) {
      const { code } = getApiErrorDetails(error);
      if (code !== "ASSET-006" || attempt >= COMPLETE_RETRY_MS.length) throw error;
      await sleep(COMPLETE_RETRY_MS[attempt]);
    }
  }
}
