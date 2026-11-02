import fs from "fs";
import path from "path";

const projectRoot = process.cwd();
const STICKERS_DIR = path.join(projectRoot, "public", "stickers");
const OUTPUT_FILE = path.join(
  projectRoot,
  "constants",
  "stickers.generated.ts"
);

// 허용할 이미지 확장자
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg"];

// 파일 이름(번호-영문)에 붙일 한국어 이름. 고르는 화면의 툴팁과 스크린리더가 이 이름을 읽는다.
// 파일을 새로 넣었는데 여기 없으면 빌드에서 알려 준다 — 「스티커 12」로 조용히 나가지 않게.
const LABELS = {
  fourcut: "네 컷 스트립",
  filmroll: "필름",
  shutter: "셔터 버튼",
  viewfinder: "뷰파인더",
  gauge: "노출 게이지",
  tape: "마스킹 테이프",
  instant: "즉석 사진",
  camera: "카메라",
  chalkak: "찰칵",
  oneulne: "오늘도, 네 컷",
  harucut: "하루컷",
  choigo: "최고야",
  saranghae: "사랑해",
  uri: "우리 오늘",
  ttojjikja: "또 찍자",
  wansung: "네 컷 완성",
  birthday: "생일 축하해",
  wedding: "결혼 축하해요",
  grad: "졸업 축하해",
  bestcut: "BEST CUT",
  heart: "하트",
  hearts: "하트 둘",
  sparkle: "반짝이",
  ribbon: "리본",
  rings: "반지",
  bouquet: "부케",
  cake: "케이크",
  gradcap: "졸업 모자",
  lightstick: "응원봉",
  clover: "네잎클로버",
};

function labelOf(file) {
  const slug = path.basename(file, path.extname(file)).replace(/^\d+-/, "");
  const label = LABELS[slug];
  if (!label) {
    console.error(`❌ ${file} 의 한국어 이름이 없습니다. scripts/generate-stickers.mjs 의 LABELS 에 넣어 주세요.`);
    process.exit(1);
  }
  return label;
}

function main() {
  if (!fs.existsSync(STICKERS_DIR)) {
    console.error("❌ public/stickers 폴더가 없습니다.");
    process.exit(1);
  }

  const files = fs
    .readdirSync(STICKERS_DIR)
    .filter((file) =>
      IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase())
    )
    .sort();

  const stickers = files.map((file, index) => {
    const id = `st-${String(index + 1).padStart(3, "0")}`;
    return {
      id,
      src: `/stickers/${file}`,
      name: labelOf(file),
    };
  });

  const content = `
// 자동 생성파일이므로 직접 수정 금지
// 생성 스크립트: scripts/generate-stickers.mjs

import type { Asset } from "@/lib/types/themeEditor";

export const STICKERS: Asset[] = ${JSON.stringify(stickers, null, 2)};
`;

  fs.writeFileSync(OUTPUT_FILE, content.trim() + "\n", "utf-8");

  console.log(`✅ stickers.generated.ts 생성 완료 (${stickers.length}개)`);
}

main();
