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
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // *.test.ts, *.test.tsx 파일만 테스트 대상으로 수집
  testMatch: ["**/?(*.)+(test).[tj]s?(x)"],
  // 빌드 산출물/외부 패키지는 테스트 대상에서 제외
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  // 커버리지 집계 대상 경로
  collectCoverageFrom: [
    "lib/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "!**/*.d.ts",
  ],
};

export default createJestConfig(config);
