/**
 * 초안 저장의 dataURL 캐시가 편집 세션 안에 갇히는지 본다.
 *
 * 캐시는 모듈 전역이라 화면을 떠나도 살아 있고, 담는 것은 원본 크기의 base64 문자열이다
 * (`addPhotoAssets` 는 고른 파일을 줄이지 않고 그대로 `createObjectURL` 한다).
 * 개수 상한만으로는 바이트가 안 잡혀서, 상한과 세션 종료 정리를 둘 다 확인한다.
 */
import type { EditorComponent } from "@/lib/types/themeEditor";

type DraftModule = typeof import("@/lib/themeEditorDraft");

const OWNER = "Opwxk27uADEJ";
const DRAFT_KEY = `harucut:theme-editor-draft:v2:${OWNER}:classic-4`;

/** src 별 원본 바이트 수. base64 는 이 값의 약 4/3 이 된다. */
let bodyBytes = new Map<string, number>();
let fetchMock: jest.Mock;

function photoComponent(id: string, source: string): EditorComponent {
  return {
    id,
    type: "PHOTO",
    source,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    scale: 1,
    rotation: 0,
    zIndex: 0,
  };
}

function saveInput(sources: string[]) {
  return {
    ownerId: OWNER,
    frameId: "classic-4" as const,
    backgroundColor: "#ffffff",
    background: { type: "COLOR" as const, value: "#ffffff" },
    cellCutouts: [false, false, false, false],
    components: sources.map((src, i) => photoComponent(`c${i}`, src)),
    now: 1_700_000_000_000,
  };
}

function fetchCountFor(src: string) {
  return fetchMock.mock.calls.filter((call) => call[0] === src).length;
}

async function loadModule(): Promise<DraftModule> {
  jest.resetModules();
  return await import("@/lib/themeEditorDraft");
}

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(1_700_000_002_000);
  window.localStorage.clear();
  bodyBytes = new Map();
  fetchMock = jest.fn(async (src: string) => ({
    blob: async () =>
      new Blob(["x".repeat(bodyBytes.get(src) ?? 1_000)], { type: "image/jpeg" }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

test("하루가 지난 초안과 비정상 시각의 초안을 지운다", async () => {
  const { saveEditorDraft, loadEditorDraft } = await loadModule();
  await saveEditorDraft(saveInput(["data:image/png;base64,eA=="]));
  expect(loadEditorDraft(OWNER, "classic-4")).not.toBeNull();
  jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000 + 86_400_001);
  expect(loadEditorDraft(OWNER, "classic-4")).toBeNull();
  expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
});

describe("saveEditorDraft 의 dataURL 캐시", () => {
  it("같은 blob 을 다시 저장할 때는 다시 읽지 않는다(캐시가 하는 일)", async () => {
    const { saveEditorDraft } = await loadModule();

    await saveEditorDraft(saveInput(["blob:a"]));
    await saveEditorDraft({ ...saveInput(["blob:a"]), now: 1_700_000_001_000 });

    // 경로 전체가 실제로 돌았는지 먼저 확인한다(조용히 삼켜지는 catch 가 있다).
    expect(window.localStorage.getItem(DRAFT_KEY)).toContain("data:image/jpeg;base64,");
    expect(fetchCountFor("blob:a")).toBe(1);
  });

  it("편집 세션이 끝나면(clearEditorDraft) 캐시도 비운다", async () => {
    const { saveEditorDraft, clearEditorDraft } = await loadModule();

    await saveEditorDraft(saveInput(["blob:a"]));
    expect(fetchCountFor("blob:a")).toBe(1);

    // 나갈 때 스토어 reset 이 blob: 을 해제하므로 남은 항목은 다시 조회되지 않는 죽은 메모리다.
    clearEditorDraft();

    await saveEditorDraft(saveInput(["blob:a"]));
    expect(fetchCountFor("blob:a")).toBe(2);
  });

  it("바이트 예산을 넘으면 오래된 항목을 버린다(개수만으로는 안 잡힌다)", async () => {
    const { saveEditorDraft } = await loadModule();

    // 폰 사진 크기의 원본 세 장. 개수는 상한(24) 한참 아래지만 base64 합계는 예산을 넘는다.
    for (const src of ["blob:a", "blob:b", "blob:c"]) bodyBytes.set(src, 13_000_000);

    await saveEditorDraft(saveInput(["blob:a", "blob:b", "blob:c"]));
    await saveEditorDraft({
      ...saveInput(["blob:a", "blob:b", "blob:c"]),
      now: 1_700_000_001_000,
    });

    // 예산이 없으면 셋 다 캐시에 남아 두 번째 저장에서 한 번도 안 읽는다.
    expect(fetchCountFor("blob:a")).toBeGreaterThan(1);
    /*
      예산(32MB)을 넘기려면 base64 합계가 그보다 커야 해서 39MB 를 실제로 인코딩한다.
      jsdom 에서 그 자체가 몇 초 걸리고, 전체 스위트를 병렬로 돌리면 기본 5초를 넘긴다.
      데이터를 줄이면 예산을 안 넘어 검사가 무의미해지므로 시간을 늘린다.
    */
  }, 30_000);

  it("초안 용량 초과로 저장을 건너뛰어도 캐시는 세션 안에 남는다", async () => {
    const { saveEditorDraft } = await loadModule();

    // 4.5MB 초안 제한을 넘기는 한 장. 저장은 취소되지만 세션은 이어진다.
    bodyBytes.set("blob:big", 5_000_000);

    await saveEditorDraft(saveInput(["blob:big"]));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();

    await saveEditorDraft({ ...saveInput(["blob:big"]), now: 1_700_000_001_000 });

    // 여기서 캐시를 비우면 디바운스마다 사진을 전부 다시 인코딩한다.
    expect(fetchCountFor("blob:big")).toBe(1);
  });
  it("늦게 끝난 변환이 최신 초안을 덮지 않는다", async () => {
    const { saveEditorDraft, loadEditorDraft } = await loadModule();
    let finish!: (value: { blob: () => Promise<Blob> }) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const older = saveEditorDraft(saveInput(["blob:slow"]));
    await saveEditorDraft({
      ...saveInput(["data:image/png;base64,bmV3"]),
      now: 1_700_000_002_000,
    });
    finish({ blob: async () => new Blob(["old"], { type: "image/png" }) });
    await older;
    expect(loadEditorDraft(OWNER, "classic-4")?.components[0].source).toBe("data:image/png;base64,bmV3");
  });

  it("삭제 중이던 변환은 초안과 캐시를 되살리지 않는다", async () => {
    const { saveEditorDraft, clearEditorDraft } = await loadModule();
    let finish!: (value: { blob: () => Promise<Blob> }) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const saving = saveEditorDraft(saveInput(["blob:slow"]));
    clearEditorDraft();
    finish({ blob: async () => new Blob(["old"], { type: "image/png" }) });
    await saving;
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    await saveEditorDraft(saveInput(["blob:slow"]));
    expect(fetchCountFor("blob:slow")).toBe(2);
  });

  it("늦게 끝난 용량 초과 초안이 최신 초안을 지우지 않는다", async () => {
    const { saveEditorDraft, loadEditorDraft } = await loadModule();
    let finish!: (value: { blob: () => Promise<Blob> }) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const older = saveEditorDraft({
      ...saveInput(["blob:slow"]),
      backgroundColor: "x".repeat(4_500_001),
    });
    await saveEditorDraft(saveInput(["data:image/png;base64,bmV3"]));
    finish({ blob: async () => new Blob(["old"], { type: "image/png" }) });
    await older;
    expect(loadEditorDraft(OWNER, "classic-4")?.components[0].source).toBe("data:image/png;base64,bmV3");
  });
});

describe("초안은 계정 × 프레임 종류마다 따로 둔다", () => {
  const OTHER = "OtherUser0001";

  // 공용 기기에서 앞 사람이 로그아웃하지 않고 떠나도, 다음 사람이 그 사진을 복원하면 안 된다.
  it("다른 계정의 초안은 복원하지 않고, 내가 저장할 때 지운다", async () => {
    const { saveEditorDraft, loadEditorDraft } = await loadModule();
    await saveEditorDraft({ ...saveInput(["data:image/png;base64,eA=="]), ownerId: OTHER });
    expect(loadEditorDraft(OWNER, "classic-4")).toBeNull();
    expect(loadEditorDraft(OTHER, "classic-4")).not.toBeNull();

    await saveEditorDraft(saveInput([]));
    expect(loadEditorDraft(OTHER, "classic-4")).toBeNull();
    expect(loadEditorDraft(OWNER, "classic-4")).not.toBeNull();
  });

  it("프레임 종류가 다르면 서로 덮지 않는다", async () => {
    const { saveEditorDraft, loadEditorDraft } = await loadModule();
    await saveEditorDraft({ ...saveInput([]), backgroundColor: "#111111" });
    await saveEditorDraft({ ...saveInput([]), frameId: "grid-4", backgroundColor: "#222222" });

    expect(loadEditorDraft(OWNER, "classic-4")?.backgroundColor).toBe("#111111");
    expect(loadEditorDraft(OWNER, "grid-4")?.backgroundColor).toBe("#222222");
  });

  it("모든 초안의 합이 예산을 넘으면 이 계정의 오래된 초안부터 버린다", async () => {
    const { saveEditorDraft, loadEditorDraft } = await loadModule();
    bodyBytes.set("blob:old", 2_000_000);
    bodyBytes.set("blob:new", 2_000_000);
    await saveEditorDraft({ ...saveInput(["blob:old"]), frameId: "grid-4", now: 1_700_000_000_000 });
    await saveEditorDraft({ ...saveInput(["blob:new"]), now: 1_700_000_001_000 });

    expect(loadEditorDraft(OWNER, "grid-4")).toBeNull();
    expect(loadEditorDraft(OWNER, "classic-4")).not.toBeNull();
  });

  it("버리기(discard)는 그 프레임의 초안만 지운다", async () => {
    const { saveEditorDraft, loadEditorDraft, discardEditorDraft } = await loadModule();
    await saveEditorDraft(saveInput([]));
    await saveEditorDraft({ ...saveInput([]), frameId: "grid-4" });

    discardEditorDraft(OWNER, "classic-4");
    expect(loadEditorDraft(OWNER, "classic-4")).toBeNull();
    expect(loadEditorDraft(OWNER, "grid-4")).not.toBeNull();
  });

  it("로그아웃 정리(clearEditorDraft)는 모든 계정의 초안을 지운다", async () => {
    const { saveEditorDraft, loadEditorDraft, clearEditorDraft } = await loadModule();
    await saveEditorDraft(saveInput([]));
    window.localStorage.setItem("harucut:theme-editor-draft:v1", "{}");

    clearEditorDraft();
    expect(loadEditorDraft(OWNER, "classic-4")).toBeNull();
    expect(window.localStorage.getItem("harucut:theme-editor-draft:v1")).toBeNull();
  });

  // 주인을 모르는 옛 초안은 누구 것인지 가릴 수 없다.
  it("옛 v1 초안은 복원하지 않고 지운다", async () => {
    const { loadEditorDraft } = await loadModule();
    window.localStorage.setItem(
      "harucut:theme-editor-draft:v1",
      JSON.stringify({ frameId: "classic-4", components: [], savedAt: 1_700_000_000_000 }),
    );
    expect(loadEditorDraft(OWNER, "classic-4")).toBeNull();
    expect(window.localStorage.getItem("harucut:theme-editor-draft:v1")).toBeNull();
  });
});
