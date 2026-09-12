import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // e2e 전용 Next 산출물(playwright.config.ts 의 NEXT_DIST_DIR). .next 와 같은 성격이다.
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local/generated artifacts:
    "playwright-report/**",
    "test-results/**",
    "storybook-static/**",
    ".codex/.tmp/**",
    ".swc/**",
    "tsconfig.tsbuildinfo",
  ]),
]);

export default eslintConfig;
