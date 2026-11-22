import { act, renderHook } from "@testing-library/react";
import {
  SERVER_DRAFT_DEBOUNCE_MS,
  SERVER_DRAFT_DISCOVERY_DEADLINE_MS,
  useServerFrameDraft,
} from "@/components/theme/editor/useServerFrameDraft";
import { clearEditorDraft } from "@/lib/themeEditorDraft";
import { useThemeEditorStore } from "@/lib/themeEditorStore";

const mockList = jest.fn();
const mockGet = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/lib/frameDraftApi", () => ({
  DRAFT_CONFLICT_CODE: "DRAFT-001",
  DRAFT_TOO_LARGE_CODE: "DRAFT-002",
  listFrameDrafts: (...args: unknown[]) => mockList(...args),
  getFrameDraft: (...args: unknown[]) => mockGet(...args),
  createFrameDraft: (...args: unknown[]) => mockCreate(...args),
  updateFrameDraft: (...args: unknown[]) => mockUpdate(...args),
  deleteFrameDraft: (...args: unknown[]) => mockDelete(...args),
}));

jest.mock("@/lib/assetUploadApi", () => ({ uploadAsset: jest.fn() }));
const mockGetImageUrlByKey = jest.fn();
jest.mock("@/lib/presignedUploadApi", () => ({
  getImageUrlByKey: (...args: unknown[]) => mockGetImageUrlByKey(...args),
}));

const OWNER = "owner-1";

function apiError(code: string, data?: unknown) {
  return Object.assign(new Error(code), { code, data: { code, data } });
}

function serverDoc(backgroundColor: string) {
  return {
    schemaVersion: 1,
    frameId: "classic-4",
    backgroundColor,
    background: { type: "COLOR", value: backgroundColor },
    cellCutouts: [false, false, false, false],
    components: [],
  };
}

function renderDraftHook() {
  return renderHook(() =>
    useServerFrameDraft({ ownerId: OWNER, frameId: "classic-4", remoteFrameId: null, ready: true }),
  );
}

async function flush() {
  await act(async () => {});
}

async function afterDebounce() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(SERVER_DRAFT_DEBOUNCE_MS + 10);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  clearEditorDraft();
  useThemeEditorStore.getState().reset();
  useThemeEditorStore.getState().setFrameId("classic-4");
  mockList.mockResolvedValue([]);
  mockGetImageUrlByKey.mockImplementation(async (key: string) => `https://s3.example.com/${key}`);
  let revision = 0;
  const saved = async () => ({ draftId: "Dr1", frameId: null, revision: ++revision, updatedAt: "2026-10-26T00:00:00Z" });
  mockCreate.mockImplementation(saved);
  mockUpdate.mockImplementation(saved);
  mockDelete.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

it("연 것만으로는 초안을 만들지 않는다", async () => {
  renderDraftHook();
  await flush();
  // 이력이 남지 않는 변경(레이어 선택 같은 것)은 사용자가 내용을 고친 것이 아니다.
  act(() => useThemeEditorStore.setState({ activeId: "layer-1" }));
  await afterDebounce();
  expect(mockCreate).not.toHaveBeenCalled();
});

it("편집하면 잠시 뒤 초안을 만들고, 다음 편집은 받은 revision 으로 고친다", async () => {
  const { result } = renderDraftHook();
  await flush();

  act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
  await afterDebounce();
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ document: expect.objectContaining({ backgroundColor: "ff0000" }), assetIds: [] }),
  );
  expect(result.current.status).toBe("saved");

  act(() => useThemeEditorStore.getState().setBackgroundColor("00ff00"));
  await afterDebounce();
  expect(mockUpdate).toHaveBeenCalledWith("Dr1", expect.objectContaining({ revision: 1 }));
});

// 「다른 기기 꺼를 가지고 있으면 그냥 그걸로 보여주면 되지」(2026-11-15) — 묻지 않고 그 초안으로 연다.
it("다른 기기의 초안이 더 새로우면 묻지 않고 그 초안으로 열고, 이어지는 편집은 그 초안에 쓴다", async () => {
  mockList.mockResolvedValue([{ draftId: "Dr9", frameId: null, revision: 5, updatedAt: "2026-10-26T01:00:00Z" }]);
  mockGet.mockResolvedValue({
    draftId: "Dr9",
    frameId: null,
    revision: 5,
    updatedAt: "2026-10-26T01:00:00Z",
    document: serverDoc("123456"),
  });
  const { result } = renderDraftHook();
  await flush();
  await flush();
  expect(useThemeEditorStore.getState().backgroundColor).toBe("123456");
  expect(result.current.restored).toBe(true);
  expect(result.current.settled).toBe(true);

  act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
  await afterDebounce();
  expect(mockUpdate).toHaveBeenCalledWith("Dr9", expect.objectContaining({ revision: 5 }));
});

it("다른 판형의 새 프레임 초안은 묻지 않는다", async () => {
  mockList.mockResolvedValue([{ draftId: "Dr9", frameId: null, revision: 1, updatedAt: "2026-10-26T01:00:00Z" }]);
  mockGet.mockResolvedValue({
    draftId: "Dr9",
    frameId: null,
    revision: 1,
    updatedAt: "2026-10-26T01:00:00Z",
    document: { ...serverDoc("123456"), frameId: "grid-4" },
  });
  const { result } = renderDraftHook();
  await flush();
  await flush();
  expect(result.current.restored).toBe(false);
  expect(result.current.settled).toBe(true);
  expect(useThemeEditorStore.getState().backgroundColor).not.toBe("123456");
});

it("다른 기기가 먼저 저장했으면(DRAFT-001) 멈추고, 덮어쓰기를 고르면 서버 revision 으로 다시 쓴다", async () => {
  const { result } = renderDraftHook();
  await flush();
  act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
  await afterDebounce();

  mockUpdate.mockRejectedValueOnce(apiError("DRAFT-001", { revision: 7, updatedAt: "2026-10-26T02:00:00Z" }));
  act(() => useThemeEditorStore.getState().setBackgroundColor("00ff00"));
  await afterDebounce();
  expect(result.current.conflict).toEqual({ revision: 7 });

  // 고르기 전에는 더 쓰지 않는다.
  act(() => useThemeEditorStore.getState().setBackgroundColor("0000ff"));
  await afterDebounce();
  expect(mockUpdate).toHaveBeenCalledTimes(1);

  await act(async () => {
    result.current.overwriteConflict();
  });
  expect(mockUpdate).toHaveBeenLastCalledWith("Dr1", expect.objectContaining({ revision: 7 }));
  expect(result.current.conflict).toBeNull();
});

it("너무 크면(DRAFT-002) 이 세션은 더 보내지 않는다", async () => {
  mockCreate.mockRejectedValueOnce(apiError("DRAFT-002"));
  const { result } = renderDraftHook();
  await flush();
  act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
  await afterDebounce();
  expect(result.current.status).toBe("tooLarge");

  act(() => useThemeEditorStore.getState().setBackgroundColor("00ff00"));
  await afterDebounce();
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

it("저장을 마치면 서버 초안을 지우고 더 쓰지 않는다", async () => {
  const { result } = renderDraftHook();
  await flush();
  act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
  await afterDebounce();

  await act(async () => {
    await result.current.finish();
  });
  expect(mockDelete).toHaveBeenCalledWith("Dr1");

  act(() => useThemeEditorStore.getState().setBackgroundColor("00ff00"));
  await afterDebounce();
  expect(mockUpdate).not.toHaveBeenCalled();
});

describe("Codex 리뷰 반영", () => {
  // #528: 첫 생성이 도는 사이 나가면 그 뒤 만들어진 초안이 서버에 남았다.
  it("생성 요청이 도는 사이 마치면 만들어진 초안을 지운다", async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    mockCreate.mockImplementation(() => new Promise((resolve) => (resolveCreate = resolve)));
    const { result } = renderDraftHook();
    await flush();
    act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
    await afterDebounce();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.finish();
    });
    await act(async () => {
      resolveCreate({ draftId: "DrLate", frameId: null, revision: 1, updatedAt: "x" });
    });
    expect(mockDelete).toHaveBeenCalledWith("DrLate");
  });

  // #528: 초안을 찾는 동안 한 편집은 예약된 저장이 건너뛰고, 찾은 뒤에도 다시 예약되지 않았다.
  it("초안을 찾기 전에 한 편집도 찾은 뒤에 저장한다", async () => {
    let resolveList: (v: unknown) => void = () => {};
    mockList.mockImplementation(() => new Promise((resolve) => (resolveList = resolve)));
    renderDraftHook();
    act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
    await afterDebounce();
    expect(mockCreate).not.toHaveBeenCalled();

    await act(async () => {
      resolveList([]);
    });
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // #528: 판형이 넷인데 최근 셋만 봐서 가장 오래된 판형의 초안을 못 찾았다.
  it("최근 셋 밖에 있는 이 판형의 초안도 찾는다", async () => {
    const summaries = ["grid-4", "wide-4", "polaroid-4", "classic-4"].map((frameId, i) => ({
      draftId: `Dr${i}`,
      frameId: null,
      revision: 1,
      updatedAt: `2026-10-26T0${4 - i}:00:00Z`,
      layout: frameId,
    }));
    mockList.mockResolvedValue(summaries);
    mockGet.mockImplementation(async (draftId: string) => {
      const s = summaries.find((x) => x.draftId === draftId)!;
      return { ...s, document: { ...serverDoc("123456"), frameId: s.layout } };
    });
    const { result } = renderDraftHook();
    await flush();
    await flush();
    expect(mockGet).toHaveBeenCalledWith("Dr3");
    expect(result.current.restored).toBe(true);
  });

  // #604: 서버 초안을 받는 사이 고친 것이 늦게 도착한 자동 복원에 덮였다(되돌리기 이력까지).
  it("서버 초안을 찾는 사이 고쳤으면 덮지 않고, 어느 쪽을 남길지 고를 때까지 쓰지 않는다", async () => {
    mockList.mockResolvedValue([{ draftId: "Dr9", frameId: null, revision: 5, updatedAt: "2026-10-26T01:00:00Z" }]);
    let resolveGet: (v: unknown) => void = () => {};
    mockGet.mockImplementation(() => new Promise((resolve) => (resolveGet = resolve)));
    const { result } = renderDraftHook();
    await flush();
    expect(mockGet).toHaveBeenCalledWith("Dr9");

    act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
    await act(async () => {
      resolveGet({ draftId: "Dr9", frameId: null, revision: 5, updatedAt: "2026-10-26T01:00:00Z", document: serverDoc("123456") });
    });
    await flush();

    expect(useThemeEditorStore.getState().backgroundColor).toBe("ff0000");
    expect(useThemeEditorStore.getState().past.length).toBeGreaterThan(0);
    expect(result.current.restored).toBe(false);
    expect(result.current.conflict).toEqual({ revision: 5 });
    await afterDebounce();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // 새 프레임은 계정을 안 순간 이 기기 임시본을 되살린다. 그것은 고친 것이 아니다 — 더 새로운 다른 기기 초안이 이긴다.
  it("찾는 사이 이 기기 임시본을 되살린 것은 편집으로 치지 않는다", async () => {
    mockList.mockResolvedValue([{ draftId: "Dr9", frameId: null, revision: 5, updatedAt: "2026-10-26T01:00:00Z" }]);
    let resolveGet: (v: unknown) => void = () => {};
    mockGet.mockImplementation(() => new Promise((resolve) => (resolveGet = resolve)));
    const { result } = renderDraftHook();
    await flush();

    act(() =>
      useThemeEditorStore.getState().hydrateDraft({
        ownerId: OWNER,
        frameId: "classic-4",
        backgroundColor: "abcdef",
        background: { type: "COLOR", value: "abcdef" },
        cellCutouts: [false, false, false, false],
        cells: null,
        components: [],
        savedAt: Date.parse("2026-10-26T00:00:00Z"),
      }),
    );
    await act(async () => {
      resolveGet({ draftId: "Dr9", frameId: null, revision: 5, updatedAt: "2026-10-26T01:00:00Z", document: serverDoc("123456") });
    });
    await flush();

    expect(useThemeEditorStore.getState().backgroundColor).toBe("123456");
    expect(result.current.restored).toBe(true);
    expect(result.current.conflict).toBeNull();
  });

  // #604: 찾기가 멈추면 settled 가 오지 않아 이 기기 복구본이 영영 판단되지 않았다.
  it("서버 초안 찾기가 상한을 넘기면 서버 초안 없이 정하고, 늦게 온 답과 이후 편집은 서버에 쓰지 않는다", async () => {
    let resolveList: (v: unknown) => void = () => {};
    mockList.mockImplementation(() => new Promise((resolve) => (resolveList = resolve)));
    const { result } = renderDraftHook();
    await flush();
    expect(result.current.settled).toBe(false);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(SERVER_DRAFT_DISCOVERY_DEADLINE_MS);
    });
    expect(result.current.settled).toBe(true);
    expect(result.current.restored).toBe(false);

    // 늦게 온 더 새로운 초안은 넣지 않는다 — 이 기기 복구본이 이미 그 자리를 맡았다.
    mockGet.mockResolvedValue({
      draftId: "Dr9",
      frameId: null,
      revision: 5,
      updatedAt: "2026-10-26T01:00:00Z",
      document: serverDoc("123456"),
    });
    await act(async () => {
      resolveList([{ draftId: "Dr9", frameId: null, revision: 5, updatedAt: "2026-10-26T01:00:00Z" }]);
    });
    await flush();
    expect(useThemeEditorStore.getState().backgroundColor).not.toBe("123456");
    expect(result.current.restored).toBe(false);

    // 무엇이 있는지 모른 채 쓰면 초안이 두 벌 생긴다 — 이 세션은 서버에 쓰지 않는다.
    act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
    await afterDebounce();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // 편집기 상태는 전역 스토어다. 나간 편집기의 늦은 응답이 다음에 연 편집기를 덮으면 안 된다.
  it("배경 주소를 받는 사이 편집기를 나갔으면 이전 초안을 다음 편집기에 넣지 않는다", async () => {
    mockList.mockResolvedValue([{ draftId: "Dr9", frameId: null, revision: 5, updatedAt: "2026-10-26T01:00:00Z" }]);
    mockGet.mockResolvedValue({
      draftId: "Dr9",
      frameId: null,
      revision: 5,
      updatedAt: "2026-10-26T01:00:00Z",
      document: { ...serverDoc("123456"), background: { type: "IMAGE", key: "uploads/users/u1/bg.png" } },
    });
    let resolveUrl: (v: string) => void = () => {};
    mockGetImageUrlByKey.mockImplementation(() => new Promise((resolve) => (resolveUrl = resolve)));
    const { unmount } = renderDraftHook();
    await flush();
    await flush();
    expect(mockGetImageUrlByKey).toHaveBeenCalledWith("uploads/users/u1/bg.png");

    unmount();
    // 다른 프레임을 연다 — 새 편집기는 이력을 비우므로 편집 여부로는 못 거른다.
    act(() => {
      useThemeEditorStore.getState().reset();
      useThemeEditorStore.getState().setFrameId("classic-4");
    });
    const opened = useThemeEditorStore.getState().background;
    await act(async () => {
      resolveUrl("https://s3.example.com/bg.png");
    });
    expect(useThemeEditorStore.getState().background).toEqual(opened);
  });

  it("충돌에서 다른 기기 내용을 불러오는 사이 편집기를 나갔으면 다음 편집기에 넣지 않는다", async () => {
    const { result, unmount } = renderDraftHook();
    await flush();
    act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
    await afterDebounce();
    mockUpdate.mockRejectedValueOnce(apiError("DRAFT-001", { revision: 7, updatedAt: "2026-10-26T02:00:00Z" }));
    act(() => useThemeEditorStore.getState().setBackgroundColor("00ff00"));
    await afterDebounce();
    expect(result.current.conflict).toEqual({ revision: 7 });

    let resolveGet: (v: unknown) => void = () => {};
    mockGet.mockImplementation(() => new Promise((resolve) => (resolveGet = resolve)));
    let reloading: Promise<void> = Promise.resolve();
    act(() => {
      reloading = result.current.reloadConflict();
    });
    unmount();
    act(() => {
      useThemeEditorStore.getState().reset();
      useThemeEditorStore.getState().setFrameId("classic-4");
    });
    const opened = useThemeEditorStore.getState().backgroundColor;
    await act(async () => {
      resolveGet({ draftId: "Dr1", frameId: null, revision: 7, updatedAt: "2026-10-26T02:00:00Z", document: serverDoc("123456") });
      await reloading;
    });
    expect(useThemeEditorStore.getState().backgroundColor).toBe(opened);
  });
});

