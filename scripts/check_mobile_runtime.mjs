import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const mobileRequire = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const manifest = mobileRequire('./package.json');
const react = mobileRequire('react/package.json').version;
const rnPath = dirname(mobileRequire.resolve('react-native/package.json'));
const rnVersion = mobileRequire('react-native/package.json').version;
const bundled = mobileRequire('expo/bundledNativeModules.json');
assert.equal(rnVersion, bundled['react-native'], 'React Native는 현재 Expo SDK의 공식 지원 버전과 일치해야 합니다.');

// RN은 React 렌더러를 자체 포함한다. peer 범위가 맞아도 정확한 버전이 다르면 실행 중 죽는다.
const rendererPath = (name) => join(rnPath, 'Libraries/Renderer/implementations', name);
assert.ok(existsSync(rendererPath('ReactFabric-dev.js')), 'Fabric 렌더러를 찾지 못했습니다.');
const renderers = ['ReactNativeRenderer-dev.js', 'ReactFabric-dev.js'].filter((name) => existsSync(rendererPath(name)));
// RN 0.86부터 레거시 렌더러가 없어졌다. 실제로 포함된 렌더러를 모두 검사한다.
for (const renderer of renderers) {
  const source = readFileSync(join(rnPath, 'Libraries/Renderer/implementations', renderer), 'utf8');
  const version = source.match(/reconcilerVersion:\s*["']([^"']+)["']/)?.[1];
  assert.ok(version, `${renderer}: 내장 렌더러 버전을 찾지 못했습니다. 검사기를 갱신하세요.`);
  assert.equal(react, version, `모바일 react ${react}와 ${renderer} ${version}가 다릅니다.`);
  assert.equal(manifest.dependencies.react, version, `모바일 react는 ${version}로 정확히 고정해야 합니다.`);
}
console.log(`mobile runtime: React ${react}, RN ${rnVersion}, Expo 공식 버전 및 ${renderers.length}개 렌더러와 일치`);
