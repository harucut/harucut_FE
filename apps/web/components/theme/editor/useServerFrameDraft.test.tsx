import { act, renderHook } from "@testing-library/react";
import { SERVER_DRAFT_DEBOUNCE_MS, useServerFrameDraft } from "@/components/theme/editor/useServerFrameDraft";
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
jest.mock("@/lib/presignedUploadApi", () => ({
  getImageUrlByKey: async (key: string) => `https://s3.example.com/${key}`,
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

it("다른 기기의 초안이 더 새로우면 묻고, 답하기 전에는 그 초안을 덮지 않는다", async () => {
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
  expect(result.current.offer).toEqual({ updatedAt: "2026-10-26T01:00:00Z" });

  act(() => useThemeEditorStore.getState().setBackgroundColor("ff0000"));
  await afterDebounce();
  expect(mockUpdate).not.toHaveBeenCalled();

  await act(async () => {
    await result.current.restoreOffer();
  });
  expect(useThemeEditorStore.getState().backgroundColor).toBe("123456");
  expect(result.current.offer).toBeNull();
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
  expect(result.current.offer).toBeNull();
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
