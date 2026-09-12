// Metro 번들러 설정.
//
// 왜 필요한가: 이 저장소는 pnpm 워크스페이스라 Metro 가 루트까지 거슬러 올라가 파일을
// 감시한다. 그 범위에 웹앱의 Next 빌드 산출물(apps/web/.next)이 들어 있는데, 개발 중
// 그 안의 경로가 계속 생겼다 사라지고 일부는 Windows 가 lstat 하지 못하는 형태다
// (`...\page\?\C:\...` 처럼 물음표가 낀 경로). 그러면 Metro 의 파일 감시자가
// 복구 불가능한 에러를 던지며 통째로 죽는다 — 실제로 웹 개발 서버를 켜 둔 채
// `expo start` 를 돌리자 UNKNOWN lstat 에러로 종료됐다(exit 7).
//
// 웹 빌드 산출물은 모바일 번들과 아무 관계가 없으므로 감시 대상에서 뺀다.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 워크스페이스 공통 패키지(@harucut/shared)를 쓰므로 루트까지 감시는 유지한다.
config.watchFolders = [workspaceRoot];

const IGNORED = [
  // 웹앱 빌드 산출물 — 개발 서버가 돌 때 쉼 없이 바뀌고, 감시자를 죽이는 경로가 섞인다.
  /apps[\\/]web[\\/]\.next([\\/].*)?$/,
  /apps[\\/]web[\\/]\.next-e2e([\\/].*)?$/,
  // 테스트·리포트 산출물.
  /apps[\\/]web[\\/](playwright-report|test-results|storybook-static)([\\/].*)?$/,
  // 버전 관리 내부 파일.
  /[\\/]\.git[\\/].*/,
];

// 기본값을 덮어쓰지 않고 **합친다**. getDefaultConfig() 가 이미 `.expo/types` 와 Metro 의
// `__tests__` 같은 것을 빼 두는데, 통째로 대입하면 그게 사라져 Expo Router 가 타입 선언을
// 다시 만들 때마다 불필요한 인덱싱과 Fast Refresh 가 생긴다.
// blockList 는 RegExp 하나일 수도, 배열일 수도, 없을 수도 있어 세 경우를 모두 받는다.
const existing = config.resolver.blockList;
const existingList = Array.isArray(existing)
  ? existing
  : existing
    ? [existing]
    : [];

config.resolver.blockList = [...existingList, ...IGNORED];

module.exports = config;
