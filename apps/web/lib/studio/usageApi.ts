import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";
import { clientApi } from "@/lib/clientApi";

/**
 * 행사 이용권 · 사용량(ADR-0008 §6, 백엔드 EventUsage). 합성 1건 = 성공한 네컷 1장이다.
 * reserved 는 접수됐지만 아직 끝나지 않은 합성 — 성공하면 used 로 가고, 실패하면 돌려받는다.
 */
export type EntitlementFeature = "WHITE_LABEL" | "CUSTOM_THEME" | "BULK_DOWNLOAD";

export type EventUsage = {
  /** 적용 이용권이 없으면 키가 없고 수치는 0. */
  entitlement?: {
    scope: "WORKSPACE" | "EVENT";
    validFrom: string;
    validTo: string;
    features?: EntitlementFeature[];
  };
  composeQuota: number;
  used: number;
  reserved: number;
  remaining: number;
  retentionDays?: number | null;
  maxBoothDevices?: number | null;
  /** 한도 알림(ADR-0009 §4) — 확정 사용량이 처음 넘은 비율과 그 시각. 넘은 것만, 오름차순. 옛 서버면 키가 없다. */
  alerts?: UsageAlert[];
  /**
   * 기업 총량(ADR-0009 §5) — 이 행사가 배분을 받았을 때만, 공간 OWNER·ADMIN 에게만 온다. 위 수치는 배분량이다.
   * 실제로 더 찍을 수 있는 양은 min(remaining, parent.remaining).
   */
  parent?: { composeQuota: number; used: number; reserved: number; remaining: number };
};

export type UsageAlert = { threshold: 80 | 95 | 100; reachedAt: string };

export async function getEventUsage(eventId: string): Promise<EventUsage> {
  const res = await clientApi.get<ApiEnvelope<EventUsage>>(`/api/client/events/${encodeURIComponent(eventId)}/usage`);
  return requireData(res.data, "사용량");
}
