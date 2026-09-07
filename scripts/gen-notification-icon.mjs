/**
 * 안드로이드 알림의 **작은 아이콘** PNG 를 웹 로고와 같은 소스에서 뽑는다.
 *
 * 왜 필요한가: 안드로이드는 상태바 아이콘을 그릴 때 **알파 채널만 본다.** 색은 통째로
 * 버리고 실루엣을 한 가지 색(우리는 `app.json` 의 `#1ED760`)으로 칠한다. 그래서 로고를
 * 그대로 구우면 바깥 라운드 사각형이 완전 불투명이라 화면에는 **초록 사각형 하나**만
 * 뜬다 — 네 칸이 그 안에 묻힌다.
 *
 * 지금이 그 상태다. `app.json` 의 expo-notifications 플러그인에 `icon` 이 없어서
 * 안드로이드가 앱 아이콘을 대신 쓰고, 같은 이유로 뭉개진 사각형이 나온다.
 * 그래서 **몸통을 버리고 칸만** 불투명 흰색으로 남긴 실루엣을 굽는다.
 *
 * 실행: node scripts/gen-notification-icon.mjs
 *
 * 좌표는 `packages/shared/src/brand-mark.ts` 한 곳에서 읽는다. 웹 헤더의 `BrandMark` 도
 * 같은 값을 쓰므로 마크를 고치려면 shared 를 고치고 이걸 다시 돌린다
 * (`scripts/gen-social-marks.mjs` 와 같은 규칙이다).
 *
 * 렌더러로 Playwright 를 쓰는 이유도 같다 — 이미 apps/web 의 devDependency 라 의존성이
 * 늘지 않고, 웹에서 보이는 것과 같은 래스터라이저를 쓴다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// shared 는 .ts 다. Node 24 는 타입을 벗겨 내고 그대로 읽는다.
const { BRAND_MARK_VIEWBOX, brandMarkToSvg } = await import(
  pathToFileURL(join(ROOT, 'packages/shared/src/brand-mark.ts')).href
);

// Playwright 는 apps/web 에 링크돼 있다.
const require = createRequire(pathToFileURL(join(ROOT, 'apps/web/package.json')).href);
const { chromium } = require('@playwright/test');

const OUT = join(ROOT, 'apps/mobile/assets/images/notification-icon.png');

/**
 * 한 변 96px 정사각형.
 *
 * 안드로이드는 이것을 24dp 로 줄여 그린다. xxxhdpi(=4x)에서 24dp 가 96px 이라, 그보다 크게
 * 구워도 더 선명해지지 않고 작게 구우면 그 기기에서 뭉갠다 — expo 가 권하는 기준선이다.
 * 정사각형인 것도 요구사항이다. 세로가 긴 마크를 그대로 넣으면 시스템이 가운데를 잘라낸다.
 */
const SIZE = 96;

/**
 * 실루엣이 사각 캔버스에서 차지할 비율.
 *
 * 여백 없이 꽉 채우면 상태바에서 옆 아이콘과 붙어 보인다. 안드로이드 가이드가 24dp 아이콘의
 * 그림 영역을 22dp 안쪽으로 두라고 하므로 그 비율(≈0.92)보다 조금 더 여유를 준다.
 */
const CONTENT_RATIO = 0.86;

const { width: vbWidth, height: vbHeight } = BRAND_MARK_VIEWBOX;
// 세로가 긴 마크다. 정사각 캔버스에 넣으려면 높이를 기준으로 맞춰야 잘리지 않는다.
const markHeight = Math.round(SIZE * CONTENT_RATIO);
const markWidth = Math.round(markHeight * (vbWidth / vbHeight));

const svg = brandMarkToSvg({ silhouette: true, fill: '#FFFFFF' });

const html = `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  #stage {
    width: ${SIZE}px; height: ${SIZE}px;
    display: flex; align-items: center; justify-content: center;
  }
  #stage svg { width: ${markWidth}px; height: ${markHeight}px; display: block; }
</style>
<div id="stage">${svg}</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});
await page.setContent(html);

// `omitBackground` 가 있어야 알파가 남는다. 없으면 흰 배경이 통째로 불투명해져,
// 안드로이드가 화면 전체를 초록 사각형으로 칠한다 — 고치려던 그 증상 그대로다.
const png = await page.locator('#stage').screenshot({ omitBackground: true });
await browser.close();

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, png);

console.log(`알림 아이콘 ${SIZE}x${SIZE} 실루엣 → ${OUT.replace(ROOT + '/', '')}`);
