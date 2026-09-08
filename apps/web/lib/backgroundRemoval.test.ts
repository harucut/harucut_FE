/**
 * 누끼(배경 제거) 모듈은 **성공한 것만** 캐시한다.
 *
 * 청크를 못 받는 것은 대개 그 순간의 네트워크다. 거부된 프로미스를 캐시에 남기면
 * 「누끼」 버튼이 새로고침 전까지 계속 즉시 실패한다 — 여기서 지키는 것이 그 회귀다.
 */

// 최상위 import 가 하나도 없으면 TS 가 이 파일을 스크립트로 보고 전역 이름을
// 다른 테스트와 공유한다(`personCutout.test.ts` 에도 같은 이름의 헬퍼가 있다).
export {};

const removeBackground = jest.fn();
let importAttempts = 0;
let failNextImport = false;

jest.mock("@imgly/background-removal", () => {
  importAttempts += 1;
  if (failNextImport) {
    throw new Error("chunk load failed");
  }
  return { removeBackground };
});

async function loadModule() {
  return import("@/lib/backgroundRemoval");
}

describe("removeImageBackground", () => {
  beforeEach(() => {
    jest.resetModules();
    removeBackground.mockReset();
    removeBackground.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    importAttempts = 0;
    failNextImport = false;
  });

  it("확장자를 벗기고 -cutout.png 를 붙인 파일을 돌려준다", async () => {
    const { removeImageBackground } = await loadModule();

    const result = await removeImageBackground(
      new File(["src"], "photo.jpeg", { type: "image/jpeg" }),
    );

    expect(result.name).toBe("photo-cutout.png");
    expect(result.type).toBe("image/png");
  });

  it("한 번 실패해도 다음 클릭은 모듈을 다시 받으러 나간다", async () => {
    const { removeImageBackground } = await loadModule();
    const file = new File(["src"], "photo.png", { type: "image/png" });

    failNextImport = true;
    await expect(removeImageBackground(file)).rejects.toThrow(
      "chunk load failed",
    );

    failNextImport = false;
    await expect(removeImageBackground(file)).resolves.toMatchObject({
      name: "photo-cutout.png",
    });
    expect(importAttempts).toBe(2);
  });

  it("성공한 모듈은 한 번만 받는다", async () => {
    const { removeImageBackground } = await loadModule();
    const file = new File(["src"], "photo.png", { type: "image/png" });

    await removeImageBackground(file);
    await removeImageBackground(file);

    expect(importAttempts).toBe(1);
  });
});
