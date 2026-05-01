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
      name: file.replace(path.extname(file), ""),
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
