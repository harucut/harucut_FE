/** @jest-environment node */

import { getBoothCurrentRun } from "@/lib/event/eventApi";

describe("부스 현재 회차", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 활성 회차가 없으면 서버는 200 에 data 키를 싣지 않는다(P2A-4 계약). 이것을 실패로 읽으면
  // 부스가 켜질 때마다 「부스 상태를 확인하지 못했어요」에 멈춘다.
  it("활성 회차가 없으면 실패가 아니라 undefined 다", async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ code: "GEN-000", status: 200 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    await expect(getBoothCurrentRun("b-token", 0)).resolves.toBeUndefined();
  });
});
