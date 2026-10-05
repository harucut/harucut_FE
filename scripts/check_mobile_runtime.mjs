import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const mobileRequire = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const manifest = mobileRequire('./package.json');
const react = mobileRequire('react/package.json').version;
const rnPath = dirname(mobileRequire.resolve('react-native/package.json'));

// RN은 React 렌더러를 자체 포함한다. peer 범위가 맞아도 정확한 버전이 다르면 실행 중 죽는다.
for (const renderer of ['ReactNativeRenderer-dev.js', 'ReactFabric-dev.js']) {
  const source = readFileSync(join(rnPath, 'Libraries/Renderer/implementations', renderer), 'utf8');
  const version = source.match(/reconcilerVersion:\s*["']([^"']+)["']/)?.[1];
  assert.ok(version, `${renderer}: 내장 렌더러 버전을 찾지 못했습니다. 검사기를 갱신하세요.`);
  assert.equal(react, version, `모바일 react ${react}와 ${renderer} ${version}가 다릅니다.`);
  assert.equal(manifest.dependencies.react, version, `모바일 react는 ${version}로 정확히 고정해야 합니다.`);
}
console.log(`mobile runtime: React ${react}, 두 RN 렌더러와 일치`);
