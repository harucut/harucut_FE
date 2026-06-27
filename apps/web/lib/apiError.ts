"use client";

const PLAN_ERROR_MESSAGES = {
  "USR-102": "요금제의 월간 프레임 생성 횟수를 초과했습니다.",
  "USR-103": "요금제에서 허용한 기록 조회 기간을 초과했습니다.",
} as const;

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

export function getUserFacingApiErrorMessage(
  error: unknown,
  fallback: string,
) {
  const { code, message } = getApiErrorDetails(error);

  if (code && code in PLAN_ERROR_MESSAGES) {
    return PLAN_ERROR_MESSAGES[code as keyof typeof PLAN_ERROR_MESSAGES];
  }

  if (message?.trim()) {
    return message;
  }

  return fallback;
}
