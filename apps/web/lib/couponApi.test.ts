/**
 * 쿠폰 API 어댑터.
 *
 * 계약의 함정이 두 개다(스웨거 실측):
 *  - `applied === false` 는 **실패가 아니라 예약**이다. 200 이고 쿠폰은 등록됐다.
 *  - 목록은 `data` 가 없을 수 있다(봉투 계약상 "없으면 키 자체가 없다").
 */
import { listMyCoupons, redeemCoupon } from "@/lib/couponApi";
import { EmptyResponseError } from "@/lib/apiEnvelope";

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock("@/lib/clientApi", () => ({
  clientApi: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("redeemCoupon", () => {
  it("코드의 앞뒤 공백을 떼고 보낸다", async () => {
    mockPost.mockResolvedValue({
      data: { code: "GEN-000", status: 200, data: { applied: true, grantTier: "PLUS" } },
    });

    await redeemCoupon("  welcome-plus  ");

    expect(mockPost).toHaveBeenCalledWith("/api/client/coupons/redeem", {
      code: "welcome-plus",
    });
  });

  it("applied=false 를 실패로 만들지 않는다 — 예약된 것이다", async () => {
    mockPost.mockResolvedValue({
      data: {
        code: "GEN-000",
        status: 200,
        data: {
          applied: false,
          grantTier: "PRO",
          startsAt: "2026-09-21T00:00:00",
        },
      },
    });

    const result = await redeemCoupon("later-pro");

    expect(result.applied).toBe(false);
    expect(result.grantTier).toBe("PRO");
    expect(result.startsAt).toBe("2026-09-21T00:00:00");
  });

  it("200 인데 본문이 비면 조용히 넘기지 않는다", async () => {
    mockPost.mockResolvedValue({ data: { code: "GEN-000", status: 200 } });

    await expect(redeemCoupon("empty")).rejects.toBeInstanceOf(EmptyResponseError);
  });
});

describe("listMyCoupons", () => {
  it("목록을 그대로 돌려준다", async () => {
    mockGet.mockResolvedValue({
      data: {
        code: "GEN-000",
        status: 200,
        data: [
          { publicId: "a1", couponName: "가입 축하", grantTier: "PLUS", status: "REDEEMED" },
        ],
      },
    });

    await expect(listMyCoupons()).resolves.toHaveLength(1);
  });

  it("data 가 없으면 빈 배열이다 — 화면이 죽지 않는다", async () => {
    mockGet.mockResolvedValue({ data: { code: "GEN-000", status: 200 } });

    await expect(listMyCoupons()).resolves.toEqual([]);
  });
});
