/**
 * 프레임 목록과 주소 파싱.
 *
 * `?frame=` 값은 사용자가 주소창에서 고칠 수 있고 이벤트 QR 링크에도 실린다. 모르는 값을
 * 그대로 통과시키면 `FRAME_LAYOUTS[frameId]` 가 undefined 라 합성 직전에 터진다 —
 * 촬영을 다 마친 뒤에야 드러나는 종류의 실패다.
 */
import {
  FRAME_CONFIGS,
  getFrameConfig,
  isFrameId,
  parseFrameIdQuery,
} from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";

describe("frames", () => {
  test("모든 프레임이 레이아웃과 짝이 맞는다", () => {
    for (const frame of FRAME_CONFIGS) {
      expect(FRAME_LAYOUTS[frame.id]).toBeDefined();
      expect(FRAME_LAYOUTS[frame.id].slots).toHaveLength(frame.slots);
    }
  });

  test("표시 이름이 비어 있지 않다", () => {
    for (const frame of FRAME_CONFIGS) {
      expect(frame.name.length).toBeGreaterThan(0);
    }
  });

  // 추천 표시는 혼자일 때만 "이걸 고르면 무난하다"로 읽힌다. 둘 이상이 되는 순간
  // 그냥 분류 라벨이 되므로, 프레임을 늘릴 때 여기서 걸리게 둔다.
  test("추천 프레임은 하나뿐이다", () => {
    expect(FRAME_CONFIGS.filter((frame) => frame.recommended)).toHaveLength(1);
  });

  test("아는 프레임 id 만 통과시킨다", () => {
    expect(parseFrameIdQuery("classic-4")).toBe("classic-4");
    expect(parseFrameIdQuery("grid-4")).toBe("grid-4");
    expect(parseFrameIdQuery("unknown")).toBeNull();
    expect(parseFrameIdQuery("")).toBeNull();
    expect(parseFrameIdQuery(null)).toBeNull();
    expect(parseFrameIdQuery(undefined)).toBeNull();
    expect(isFrameId("polaroid-4")).toBe(true);
    expect(isFrameId("classic-5")).toBe(false);
  });

  test("찾지 못하면 첫 프레임으로 떨어진다", () => {
    expect(getFrameConfig("wide-4").id).toBe("wide-4");
    expect(getFrameConfig("nope" as never).id).toBe(FRAME_CONFIGS[0].id);
  });
});
