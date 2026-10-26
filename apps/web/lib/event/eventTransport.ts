"use client";

import { CLIENT_NETWORK_UNREACHABLE_CODE } from "@harucut/shared";
import { ApiRequestError, extractEnvelopeLike } from "@/lib/clientApi";
import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";

/**
 * 행사 화면(참가자·부스·결과 수령)이 BFF 를 부르는 전송 계층.
 *
 * 회원용 `clientApi` 와 **일부러 갈랐다**(기획 R5 15절, F48·O34).
 *  - 회원 쿠키를 보내지 않는다(`credentials: "omit"`). 자격은 헤더 하나로만 보낸다.
 *  - 401 에 회원 refresh 를 시도하지 않고, 전역 「세션 만료」 처리도 부르지 않는다.
 *    참가자 세션 만료(PART-001)는 참가 흐름이 직접 처리한다.
 *  - 403 GEN-021 에 탈퇴요청 확인(/api/auth/status)도 하지 않는다 — 탈퇴요청 회원이 행사 화면에서
 *    회원 복구 팝업을 받으면 안 된다.
 * 공유하는 것은 오류 봉투 해석과 오류 형식(ApiRequestError)뿐이다 — 화면은 같은 방식으로 문구를 고른다.
 */
export type EventCredential =
  | { kind: "participant"; token: string }
  | { kind: "booth"; token: string }
  | { kind: "result"; token: string };

const CREDENTIAL_HEADER: Record<EventCredential["kind"], string> = {
  participant: "X-Participant-Token",
  booth: "X-Booth-Token",
  result: "Authorization",
};

export async function sendEventRequest<T>(
  method: "GET" | "POST",
  path: string,
  options: {
    credential?: EventCredential | null;
    body?: unknown;
    signal?: AbortSignal;
    /** 응답 data 를 꺼낼 때 비었으면 던질 이름. 주지 않으면 data 가 비어도 undefined 를 돌려준다. */
    what?: string;
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const credential = options.credential;
  if (credential) {
    headers.set(
      CREDENTIAL_HEADER[credential.kind],
      credential.kind === "result" ? `Bearer ${credential.token}` : credential.token,
    );
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "omit",
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError({ code: CLIENT_NETWORK_UNREACHABLE_CODE, apiMessage: null });
  }

  let text = "";
  try {
    text = await res.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError({ code: CLIENT_NETWORK_UNREACHABLE_CODE, apiMessage: null });
  }
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const envelope = extractEnvelopeLike(data);
    throw new ApiRequestError({
      status: res.status,
      data,
      code: envelope?.code,
      apiMessage: envelope?.message,
    });
  }

  const envelope = (data ?? {}) as ApiEnvelope<T>;
  if (options.what) return requireData(envelope, options.what);
  return envelope.data as T;
}
