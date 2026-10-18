import { devices, test as base } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// WebKit의 임시(사생활 보호) 컨텍스트는 Blob을 IndexedDB에 쓰지 못한다.
// 이 검사는 일반 Safari의 저장된 촬영 복원과 다운로드를 보므로 독립 디스크 프로필을 쓴다.
// 임시 모드의 보관 실패 안내는 기존 저장소 오류 처리로 유지한다.
export const test = base.extend({
  context: async ({ context, browserName, playwright, baseURL }, provideContext) => {
    if (browserName !== "webkit") {
      await provideContext(context);
      return;
    }
    const profile = await mkdtemp(join(tmpdir(), "harucut-safari-"));
    const safari = await playwright.webkit.launchPersistentContext(profile, {
      ...devices["iPhone 13"], baseURL, acceptDownloads: true,
    });
    try { await provideContext(safari); }
    finally { await safari.close(); await rm(profile, { recursive: true, force: true }); }
  },
});
