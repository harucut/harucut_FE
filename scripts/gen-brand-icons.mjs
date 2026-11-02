/**
 * 웹·앱 아이콘 PNG 를 로고 원본(`packages/shared/src/brand-mark.ts`)에서 굽는다.
 *
 * 실행: node scripts/gen-brand-icons.mjs
 *
 * 로고를 고치면 shared 를 고치고 이걸 다시 돌린다. 알림 아이콘은 `gen-notification-icon.mjs` 가 따로 굽는다
 * (알파만 쓰는 실루엣이라 규칙이 다르다). 생성물은 커밋한다. 렌더러는 그쪽과 같은 Playwright 다 — 의존성이 늘지 않는다.
 */
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { BRAND_MARK_BODY, brandMarkToSvg } = await import(pathToFileURL(join(ROOT, 'packages/shared/src/brand-mark.ts')).href);
const require = createRequire(pathToFileURL(join(ROOT, 'apps/web/package.json')).href);
const { chromium } = require('@playwright/test');

const WEB = join(ROOT, 'apps/web/public');
const APP = join(ROOT, 'apps/mobile/assets/images');
const INK = BRAND_MARK_BODY.fill;

/**
 * full: 둥근 몸통까지 캔버스를 채운다(투명 모서리) — 브라우저 탭.
 * square: 네모 바탕을 깔고 ㅎ 을 얹는다 — iOS·안드로이드가 스스로 모서리를 깎는 곳. 투명을 남기면 검게 칠하거나 거절한다.
 * glyph: 바탕 없이 ㅎ 만, 가운데 안전 영역에 — 안드로이드 적응형 전경·스플래시.
 */
const TARGETS = [
  { file: join(WEB, 'favicon-16x16.png'), size: 16, kind: 'full' },
  { file: join(WEB, 'favicon-32x32.png'), size: 32, kind: 'full' },
  { file: join(WEB, 'apple-touch-icon.png'), size: 180, kind: 'square', scale: 1 },
  { file: join(WEB, 'icon-192.png'), size: 192, kind: 'full' },
  { file: join(WEB, 'icon-512.png'), size: 512, kind: 'full' },
  // 마스커블은 가운데 80% 만 보장된다.
  { file: join(WEB, 'icon-maskable-512.png'), size: 512, kind: 'square', scale: 0.8 },
  { file: join(APP, 'icon.png'), size: 1024, kind: 'square', scale: 1 },
  // 적응형 아이콘 전경은 가운데 66% 안전 영역에 넣는다. 바탕색은 app.json 이 깐다.
  { file: join(APP, 'android-icon-foreground.png'), size: 1024, kind: 'glyph', scale: 0.62 },
  { file: join(APP, 'splash-icon.png'), size: 1024, kind: 'glyph', scale: 0.8 },
];

function html({ size, kind, scale = 1 }) {
  const inner = brandMarkToSvg().replace('<svg ', `<svg width="${size * scale}" height="${size * scale}" `);
  // 몸통을 뺀 ㅎ: square·glyph 는 바탕이 따로 있으니 몸통 사각형을 지운다.
  const glyphOnly = inner.replace(/<rect width="32" height="32"[^>]*\/>/, '');
  const background = kind === 'square' ? INK : 'transparent';
  const content = kind === 'full' ? inner : glyphOnly;
  return `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${background};display:flex;align-items:center;justify-content:center">${content}</body></html>`;
}

const browser = await chromium.launch();
for (const target of TARGETS) {
  const page = await browser.newPage({ viewport: { width: target.size, height: target.size } });
  await page.setContent(html(target));
  const png = await page.screenshot({ omitBackground: target.kind !== 'square' });
  await writeFile(target.file, png);
  await page.close();
  console.log(`✓ ${target.file.replace(ROOT + '/', '')} (${target.size}px)`);
}
await browser.close();
