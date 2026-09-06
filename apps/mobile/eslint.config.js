// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // .expo 는 expo start 가 만드는 임시 산출물이다(gitignore 대상). 그 안의 _error.js 가
    // metro 내부 경로를 import 해서, 한 번이라도 앱을 띄운 기계에서는 lint 가 항상 빨갰다.
    ignores: ['dist/*', '.expo/*'],
  },
]);
