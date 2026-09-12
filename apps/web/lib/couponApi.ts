"use client";

import { clientApi } from "@/lib/clientApi";
import { requireData } from "@/lib/apiEnvelope";
import type { ApiEnvelope, CouponRedeemResult, MyCoupon } from "@/lib/api-types";

/**
 * 쿠폰 등록.
 *
 * ## `applied === false` 를 실패로 다루지 말 것
 *
 * 200 이고 쿠폰은 정상 등록됐다. 다만 **이미 유료 사용자**여서 지금 덮어쓰지 않고
 * 현재 구독이 끝난 뒤 시작하도록 예약한 것이다. 돈 내고 쓰는 PRO 위에 PLUS 쿠폰을
 * 덮어써 강등시키지 않으려는 장치다(스웨거).
 *
 * 그래서 화면 문구가 두 갈래여야 한다 — "지금부터 쓸 수 있어요" / "OO 부터 시작해요".
 */
export async function redeemCoupon(code: string) {
  const res = await clientApi.post<ApiEnvelope<CouponRedeemResult>>(
    "/api/client/coupons/redeem",
    { code: code.trim() },
  );
  return requireData(res.data, "쿠폰 적용 결과");
}

/** 내가 쓴 쿠폰(적용 완료 + 예약분). 없으면 빈 배열. */
export async function listMyCoupons() {
  const res = await clientApi.get<ApiEnvelope<MyCoupon[]>>(
    "/api/client/coupons",
    { cache: "no-store" },
  );
  return res.data.data ?? [];
}
