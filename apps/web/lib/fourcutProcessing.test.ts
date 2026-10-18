import { saveFourcutToServer } from "./fourcutProcessing";
import { composeFourcutOnServer } from "./fourcutCompose";
import { findMyMedia, getMediaDownloadUrl, updateMediaDisplayName } from "./userMediaApi";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";

jest.mock("./fourcutCompose", () => ({ composeFourcutOnServer: jest.fn() }));
jest.mock("./userMediaApi", () => ({ findMyMedia: jest.fn(), getMediaDownloadUrl: jest.fn(), updateMediaDisplayName: jest.fn() }));
const args = {
  sources: ["1", "2", "3", "4"], layout: FRAME_LAYOUTS["classic-4"], outputFilter: "NONE" as const,
  frameId: "classic-4" as const, remoteFrameId: null, displayName: "harucut_20261018_233100", idempotencyKey: "same-job",
};
const stored = { mediaId: 1, s3Key: "uploads/job-1.jpg", displayName: "내 사진.jpg", viewUrl: "https://example.com/job-1.jpg" };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(composeFourcutOnServer).mockResolvedValue({ mediaId: 1 });
  jest.mocked(findMyMedia).mockResolvedValue(stored);
});
it("같은 합성 재조회는 저장된 이름을 보존하고 이름 PATCH를 보내지 않는다", async () => {
  const first = await saveFourcutToServer(args);
  const replay = await saveFourcutToServer({ ...args, displayName: "harucut_20261018_235000" });
  expect(first).toMatchObject({ displayName: "내 사진.jpg", extension: "jpg" });
  expect(replay).toMatchObject({ displayName: "내 사진.jpg", mediaId: 1 });
  expect(updateMediaDisplayName).not.toHaveBeenCalled();
});
it("게스트 이름은 서버 기본 이름일 때만 처음 반영한다", async () => {
  jest.mocked(findMyMedia).mockResolvedValueOnce({ ...stored, displayName: "harucut_20261018_232459.jpg" });
  jest.mocked(updateMediaDisplayName).mockResolvedValueOnce({ ...stored, displayName: "체험 사진.jpg" });
  expect(await saveFourcutToServer({ ...args, initialDisplayName: "체험 사진" })).toMatchObject({ displayName: "체험 사진.jpg" });
  expect(updateMediaDisplayName).toHaveBeenCalledWith(1, "체험 사진");
  jest.mocked(updateMediaDisplayName).mockClear();
  await saveFourcutToServer({ ...args, initialDisplayName: "체험 사진" });
  expect(updateMediaDisplayName).not.toHaveBeenCalled();
});
it("목록 조회 실패로 이름을 모르면 다운로드를 복구하되 이름을 덮지 않는다", async () => {
  jest.mocked(findMyMedia).mockRejectedValueOnce(new Error("offline"));
  jest.mocked(getMediaDownloadUrl).mockResolvedValueOnce("https://example.com/old.png");
  expect(await saveFourcutToServer({ ...args, initialDisplayName: "체험 사진" })).toMatchObject({ extension: "png" });
  expect(updateMediaDisplayName).not.toHaveBeenCalled();
});
