/**
 * 앱(React Native)용 소셜 심볼 PNG 를 웹과 같은 소스에서 뽑는다.
 *
 * 왜 필요한가: 앱에는 react-native-svg 가 없어 SVG 를 그대로 못 쓴다. 그렇다고 PNG 를 따로
 * 관리하면 정확히 예전 문제로 돌아간다 — 웹 로고가 18/20/22px, 앱이 20/26/30px 로 갈라져
 * 같은 버튼이 플랫폼마다 다른 크기였다. 그래서 경로와 크기는 packages/shared 에 한 벌만 두고,
 * 앱 PNG 는 이 스크립트가 거기서 렌더한다. 마크를 고치려면 shared 를 고치고 이걸 다시 돌린다.
 *
 * 실행: node scripts/gen-social-marks.mjs
 *
 * 산출물은 apps/mobile/assets/images/ 아래 9개다(3마크 × @1x·@2x·@3x). React Native 는
 * `foo.png` 를 요청하면 화면 배율에 따라 `foo@2x.png` / `foo@3x.png` 를 알아서 고른다.
 *
 * 렌더러로 Playwright 를 쓰는 이유는 새 의존성을 안 늘리기 위해서다 — 이미 apps/web 의
 * devDependency 다. 브라우저가 그리므로 웹에서 보이는 것과 같은 래스터라이저를 쓴다.
 *
 * 네이버 N 은 `currentColor` 라 색이 없다. 앱에서는 tintColor 로 칠하지 않고 흰색으로 구워
 * 낸다 — 구글 G 는 색 변경 자체가 금지라, 마크마다 칠하는 방식이 다르면 또 갈라진다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// shared 는 .ts 다. Node 24 는 타입을 벗겨 내고 그대로 읽는다.
const { SOCIAL_MARK_SIZE, socialMarkToSvg } = await import(
  pathToFileURL(join(ROOT, 'packages/shared/src/social-marks.ts')).href
);

// Playwright 는 apps/web 에 링크돼 있다.
const require = createRequire(pathToFileURL(join(ROOT, 'apps/web/package.json')).href);
const { chromium } = require('@playwright/test');

const OUT_DIR = join(ROOT, 'apps/mobile/assets/images');

/** 파일명과, currentColor 인 마크에 구워 넣을 색. */
const TARGETS = [
  { provider: 'google', file: 'social-google-g', fill: undefined },
  { provider: 'kakao', file: 'social-kakao-bubble', fill: undefined },
  // 네이버 버튼 배경이 #03A94D 초록이라 N 은 흰색이다.
  { provider: 'naver', file: 'social-naver-n', fill: '#FFFFFF' },
];

const SCALES = [
  { suffix: '', factor: 1 },
  { suffix: '@2x', factor: 2 },
  { suffix: '@3x', factor: 3 },
];

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();

for (const { provider, file, fill } of TARGETS) {
  const px = SOCIAL_MARK_SIZE[provider];
  const svg = socialMarkToSvg(provider, fill);

  for (const { suffix, factor } of SCALES) {
    const page = await browser.newPage({
      viewport: { width: Math.ceil(px) + 8, height: Math.ceil(px) + 8 },
      deviceScaleFactor: factor,
    });
    await page.setContent(
      `<!doctype html><html><body style="margin:0">` +
        svg.replace('<svg ', `<svg id="m" width="${px}" height="${px}" style="display:block" `) +
        `</body></html>`,
    );
    const png = await page.locator('#m').screenshot({ omitBackground: true });
    await page.close();

    const path = join(OUT_DIR, `${file}${suffix}.png`);
    await writeFile(path, png);
    console.log(`${file}${suffix}.png  ${Math.round(px * factor)}px  ${(png.length / 1024).toFixed(1)}KB`);
  }
}

await browser.close();
console.log(`\n완료 — ${OUT_DIR}`);
