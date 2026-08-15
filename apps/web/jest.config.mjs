import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config = {
  // React 컴포넌트/DOM 테스트를 위해 브라우저 유사 환경 사용
  testEnvironment: "jest-environment-jsdom",
  // matcher 확장(@testing-library/jest-dom) 같은 전역 초기화 파일
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // tsconfig의 @/* alias를 Jest에서도 동일하게 인식
  // 워크스페이스 공통 패키지는 TS 소스를 직접 매핑해 변환 대상에 포함시킨다
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@harucut/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
  // *.test.ts, *.test.tsx 파일만 테스트 대상으로 수집
  testMatch: ["**/?(*.)+(test).[tj]s?(x)"],
  // 빌드 산출물/외부 패키지는 테스트 대상에서 제외
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  // 커버리지 집계 대상 경로.
  // app/**도 포함한다 — 예전엔 lib/·components/만 잡아 페이지와 _hooks(촬영 훅 등)가
  // 통째로 집계 밖이었고, 그래서 사각지대가 수치로 드러나지 않았다.
  // 라우트 메타 파일(layout·not-found·sitemap 등)은 로직이 없어 제외한다.
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "lib/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!app/**/layout.tsx",
    "!app/**/loading.tsx",
    "!app/**/error.tsx",
    "!app/**/not-found.tsx",
    "!app/{sitemap,robots,manifest}.ts",
  ],
};

export default createJestConfig(config);
