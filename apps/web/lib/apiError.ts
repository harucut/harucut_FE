"use client";

import { getPlanErrorMessage } from "@harucut/shared";

type ApiErrorDetails = {
  status?: number;
  code?: string;
  message?: string | null;
};

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function getApiErrorDetails(error: unknown): ApiErrorDetails {
  const record = asRecord(error);
  if (!record) {
    return {};
  }

  const data = asRecord(record.data);

  const status =
    typeof record.status === "number"
      ? record.status
      : typeof data?.status === "number"
        ? data.status
        : undefined;

  const code =
    typeof record.code === "string"
      ? record.code
      : typeof data?.code === "string"
        ? data.code
        : undefined;

  const message =
    typeof record.apiMessage === "string" || record.apiMessage === null
      ? (record.apiMessage as string | null)
      : typeof record.message === "string" || record.message === null
        ? (record.message as string | null)
        : typeof data?.message === "string" || data?.message === null
          ? (data.message as string | null)
          : undefined;

  return { status, code, message };
}

// 서버 응답에서 온 메시지만 골라낸다.
// 일반 Error의 message(내부 영문 원문)는 사용자에게 보여주지 않는다.
function getServerMessage(error: unknown): string | null {
  const record = asRecord(error);
  if (!record) return null;

  if (typeof record.apiMessage === "string" && record.apiMessage.trim()) {
    return record.apiMessage;
  }

  const data = asRecord(record.data);
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }

  return null;
}

export function getUserFacingApiErrorMessage(
  error: unknown,
  fallback: string,
) {
  const { code } = getApiErrorDetails(error);

  const planMessage = getPlanErrorMessage(code);
  if (planMessage) {
    return planMessage;
  }

  return getServerMessage(error) ?? fallback;
}
