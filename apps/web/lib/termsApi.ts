"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope } from "@/lib/api-types";

/**
 * 약관 동의 기록. **서버가 진실의 원천이다.**
 *
 * 어떤 약관이 있고 무엇이 필수인지, 지금 몇 버전인지는 전부 서버가 정한다(관리자가
 * `POST /api/admin/terms` 로 등록한다). 프론트가 코드를 상수로 박아 두면 관리자가
 * 약관을 하나 더 만들거나 코드를 다르게 지은 순간 조용히 어긋난다 — 화면엔 체크박스가
 * 보이는데 서버엔 그 코드가 없어 `TERMS-001` 로 튕긴다.
 *
 * 그래서 화면은 `fetchActiveTerms()` 가 준 목록으로 그린다. 아래 `TERMS_CONTENT_HREF`
 * 는 "이 코드는 우리 약관 페이지로 보내면 된다"는 힌트일 뿐, 목록의 출처가 아니다.
 *
 * 실측 근거는 docs/backend-contract.md "약관 동의" 절.
 */

export type ActiveTerms = {
  /** 동의 API 에 그대로 넘기는 값. 한 번 정해지면 바뀌지 않는다. */
  code: string;
  title: string;
  /** 필수 약관은 **철회할 수 없다**(TERMS-003). 탈퇴로만 가능하다. */
  required: boolean;
  version: number;
  /** 현재 버전 본문 전문. 본문만 따로 받는 API 는 없다. */
  content: string;
};

export type TermsConsentStatus = "AGREED" | "NEEDS_RECONSENT" | "NOT_AGREED";

export type MyTermsConsent = {
  code: string;
  title: string;
  required: boolean;
  status: TermsConsentStatus;
  /** 동의한 적이 없거나 철회했으면 **키 자체가 없다.** */
  agreedVersion?: number;
  latestVersion: number;
};

export type TermsAgreementItem = {
  code: string;
  agreed: boolean;
};

/** 우리 약관 화면이 있는 코드. 없으면 서버가 준 본문을 그 자리에서 펼쳐 보여 준다. */
const TERMS_CONTENT_HREF: Record<string, string> = {
  tos: "/terms",
  terms: "/terms",
  privacy: "/privacy",
  marketing: "/privacy",
};

export function termsContentHref(code: string): string | null {
  return TERMS_CONTENT_HREF[code] ?? null;
}

/**
 * 활성 약관 목록. 인증이 필요 없어 가입 화면에서도 부를 수 있다.
 *
 * 활성 약관이 하나도 없으면 **빈 배열**이다(실패가 아니다). 아직 관리자가 약관을
 * 등록하지 않은 환경이 실제로 그렇다 — 그때는 호출부가 동의 기록을 건너뛴다.
 */
export async function fetchActiveTerms(): Promise<ActiveTerms[]> {
  const res = await clientApi.get<ApiEnvelope<ActiveTerms[]>>(
    "/api/client/terms",
  );
  return res.data.data ?? [];
}

/** 활성 약관 **전체** 기준. 한 번도 건드리지 않은 약관도 `NOT_AGREED` 로 나온다. */
export async function fetchMyTermsConsents(): Promise<MyTermsConsent[]> {
  const res = await clientApi.get<ApiEnvelope<MyTermsConsent[]>>(
    "/api/client/auth/terms/consents/me",
  );
  return res.data.data ?? [];
}

/**
 * 동의·철회. **전부 아니면 전무다** — 한 항목이 실패하면 앞의 것도 저장되지 않는다.
 *
 * 서버는 어느 항목이 왜 틀렸는지 알려주지 않는다(본문이 배열이라 필드 경로를 담을 수
 * 없다 — GEN-002 하나로 온다). 그래서 보내기 전에 여기서 거른다.
 */
export async function submitTermsConsents(
  items: TermsAgreementItem[],
): Promise<void> {
  const payload = items.filter(
    (item) => typeof item.code === "string" && item.code.trim().length > 0,
  );
  if (payload.length === 0) return;

  // 최상위가 배열이어야 한다. 객체로 감싸면 GEN-006.
  await clientApi.post("/api/client/auth/terms/consents", payload);
}

/**
 * 지금 사용자를 붙잡아야 하는가 — 필수 약관 중 아직 동의가 유효하지 않은 것.
 *
 * 서버는 재동의를 강제하지 않는다. 재동의하지 않아도 다른 API 는 전부 정상 동작하므로,
 * 언제 막을지는 전적으로 프론트가 정한다.
 */
export function pendingRequiredConsents(
  consents: MyTermsConsent[],
): MyTermsConsent[] {
  return consents.filter(
    (consent) => consent.required && consent.status !== "AGREED",
  );
}
