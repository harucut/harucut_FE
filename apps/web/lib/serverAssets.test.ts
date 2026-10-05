import type { RemoteFrame } from "@/lib/api-types";
import {
  isAssetFrame,
  parseAssetTitle,
  toServerAssetCatalog,
  toTrustedImageUrl,
} from "./serverAssets";

const url =
  "https://harucuts3.s3.ap-northeast-2.amazonaws.com/uploads/users/1/components/heart.png?X-Amz-Signature=test";
const frame = (title: string, frameId = 1): RemoteFrame => ({
  title,
  frameId,
  frameType: "CLASSIC",
  isSystem: true,
  source: url,
  components: [],
});

test.each([
  ["[스티커] 웨딩/하트", "sticker", "웨딩", "하트"],
  [" ［ STICKER ］ 여행 / 비행기 ", "sticker", "여행", "비행기"],
  ["【bg】Wedding/Ivory", "background", "Wedding", "Ivory"],
  ["[배경] 벚꽃", "background", null, "벚꽃"],
])("소재 이름 %s을 분류한다", (title, kind, category, name) => {
  expect(parseAssetTitle(title)).toEqual({ kind, category, name });
});
test.each([
  "[프레임] [배경] 봄",
  "[이벤트] 봄",
  "배경 벚꽃",
  "[constructor] x",
  "[__proto__] x",
  undefined,
])("프레임 이름 %s은 자산이 아니다", (title) => {
  expect(parseAssetTitle(title)).toBeNull();
});
test.each([
  "http://harucuts3.s3.ap-northeast-2.amazonaws.com/uploads/users/1/components/a.png",
  "https://harucuts3.s3.ap-northeast-2.amazonaws.com.evil.test/uploads/users/1/components/a.png",
  "https://evil.test/uploads/users/1/components/a.png",
  "data:image/png;base64,x",
  "/stickers/a.png",
  url.replace("heart.png", "heart.svg"),
  url.replace("/components/", "/private/"),
])("허용되지 않은 이미지 주소 %s을 거부한다", (value) =>
  expect(toTrustedImageUrl(value)).toBeNull(),
);
test("시스템 자산만 등록 순서로 모으고 배경 색과 이미지를 구분한다", () => {
  const catalog = toServerAssetCatalog([
    frame("[스티커] 여행/별", 6),
    frame("[스티커] 웨딩/하트", 2),
    { ...frame("[배경] 바다", 3), background: { type: "IMAGE", url } },
    { ...frame("[배경] 아이보리", 4), background: { type: "COLOR", value: "fffFeE" } },
    { ...frame("[배경] 오류", 5), background: { type: "COLOR", value: "red" } },
    { ...frame("[스티커] 내 프레임"), isSystem: false },
    frame("기본 프레임"),
    frame("[스티커]"),
  ]);
  expect(catalog.stickers.map((a) => a.id)).toEqual(["server-2", "server-6"]);
  expect(catalog.backgrounds.map((a) => [a.imageUrl, a.color])).toEqual([
    [url, null],
    [null, "#ffffee"],
  ]);
  expect(isAssetFrame(frame("[스티커]"))).toBe(true);
  expect(isAssetFrame({ ...frame("[스티커] 하트"), isSystem: false })).toBe(false);
});
