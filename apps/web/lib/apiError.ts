"use client";

import { getApiErrorMessageByCode, getPlanErrorMessage } from "@harucut/shared";

type ApiFieldError = {
  field?: string;
  message?: string;
  rejectedValue?: unknown;
};

type ApiErrorDetails = {
  status?: number;
  code?: string;
  message?: string | null;
  // 검증 실패(400 GEN-003) 응답의 data[]. 서버가 한국어를 주는 유일한 자리다.
  fieldErrors?: ApiFieldError[];
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

  // 검증 실패 응답만 data가 배열이다: [{ field, message, rejectedValue }]
  const rawFieldErrors = Array.isArray(record.data)
    ? record.data
    : Array.isArray(data?.data)
      ? (data.data as unknown[])
      : null;

  const fieldErrors = rawFieldErrors
    ?.map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      field: typeof item.field === "string" ? item.field : undefined,
      message: typeof item.message === "string" ? item.message : undefined,
      rejectedValue: item.rejectedValue,
    }));

  return {
    status,
    code,
    message,
    ...(fieldErrors && fieldErrors.length > 0 ? { fieldErrors } : {}),
  };
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
  const { code, fieldErrors } = getApiErrorDetails(error);

  const planMessage = getPlanErrorMessage(code);
  if (planMessage) {
    return planMessage;
  }

  // 검증 실패는 서버가 필드별 한국어 사유를 준다(@field:NotBlank 등). 그게 가장 정확하다.
  const fieldMessage = fieldErrors?.find((item) => item.message?.trim())?.message?.trim();
  if (fieldMessage) {
    return fieldMessage;
  }

  const mapped = getApiErrorMessageByCode(code);
  if (mapped) {
    return mapped;
  }

  // 여기까지 왔으면 우리가 모르는 코드다. 서버 message는 영문이라 그대로 노출하지 않고
  // 화면별 한국어 폴백을 쓰되, 원인 추적을 위해 콘솔에는 남긴다.
  const serverMessage = getServerMessage(error);
  if (serverMessage && process.env.NODE_ENV !== "production") {
    console.error(`[api] 미매핑 에러 code=${code ?? "?"} message=${serverMessage}`);
  }

  return fallback;
}
