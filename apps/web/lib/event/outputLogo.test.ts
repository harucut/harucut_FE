import { outputLogoRect } from "@/lib/event/outputLogo";

it("가로로 긴 로고는 캔버스 너비의 18% 로, 오른쪽 아래 3% 여백에 놓는다", () => {
  expect(outputLogoRect({ width: 600, height: 1800 }, { width: 400, height: 100 })).toEqual({
    x: 600 - 18 - 108,
    y: 1800 - 18 - 27,
    width: 108,
    height: 27,
  });
});

it("세로로 길면 높이를 캔버스 높이의 12% 로 묶고 너비를 비율대로 줄인다", () => {
  // 1200×600 캔버스: 너비 216 이면 높이 432 > 72 → 높이 72, 너비 36.
  expect(outputLogoRect({ width: 1200, height: 600 }, { width: 100, height: 200 })).toEqual({
    x: 1200 - 36 - 36,
    y: 600 - 36 - 72,
    width: 36,
    height: 72,
  });
});
