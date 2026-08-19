/**
 * 서버 합성 오케스트레이션이 계약대로 움직이는지 지킨다.
 *
 * 실측 근거(docs/backend-contract.md):
 *  - 원본은 `type: FOURCUT_SOURCE` 로 올린다
 *  - 필터는 **서버가 모른다** — 올리기 전에 픽셀에 구워야 한다
 *  - `frameId` 는 내 프레임이거나 **시스템 프레임**이어야 한다
 */
import {
  composeFourcutOnServer,
  resolveComposeFrameId,
  SystemFrameMissingError,
} from "@/lib/fourcutCompose";

const mockListAllFrames = jest.fn();
const mockUpload = jest.fn();
const mockRequestCompose = jest.fn();
const mockWaitForCompose = jest.fn();

jest.mock("@/lib/remoteFrameApi", () => ({
  listAllFrames: (...args: unknown[]) => mockListAllFrames(...args),
}));

jest.mock("@/lib/presignedUploadApi", () => ({
  PRESIGNED_UPLOAD_TYPES: { FOURCUT_SOURCE: "FOURCUT_SOURCE" },
  uploadToS3WithPresigned: (...args: unknown[]) => mockUpload(...args),
}));

jest.mock("@/lib/composeApi", () => ({
  requestCompose: (...args: unknown[]) => mockRequestCompose(...args),
  waitForCompose: (...args: unknown[]) => mockWaitForCompose(...args),
  newIdempotencyKey: () => "web-fixed-key",
}));

jest.mock("@/lib/canvas/loaders", () => ({
  loadImage: jest.fn().mockResolvedValue({ naturalWidth: 600, naturalHeight: 800 }),
}));

const layout = {
  totalWidth: 2000,
  totalHeight: 6000,
  slots: [
    { x: 150, y: 200, width: 1700, height: 1200 },
    { x: 150, y: 1480, width: 1700, height: 1200 },
    { x: 150, y: 2760, width: 1700, height: 1200 },
    { x: 150, y: 4040, width: 1700, height: 1200 },
  ],
};

const SOURCES = ["a", "b", "c", "d"];

beforeEach(() => {
  jest.clearAllMocks();

  // jsdom 캔버스는 toBlob 이 없다. 굽는 단계는 형식만 확인하면 되므로 최소로 흉내낸다.
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    filter: "none",
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
    drawImage: jest.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function (cb) {
    cb(new Blob(["x"], { type: "image/jpeg" }));
  } as typeof HTMLCanvasElement.prototype.toBlob;

  mockUpload.mockImplementation(async ({ file }: { file: File }) => ({
    key: `uploads/users/me/fourcuts/sources/${file.name}`,
  }));
  mockRequestCompose.mockResolvedValue({ jobId: 7, status: "PENDING" });
  mockWaitForCompose.mockResolvedValue({ jobId: 7, status: "DONE", mediaId: 42 });
});

describe("resolveComposeFrameId", () => {
  it("내가 만든 프레임을 골랐으면 그 id 를 그대로 쓴다", async () => {
    await expect(resolveComposeFrameId("classic-4", 99)).resolves.toBe(99);
    expect(mockListAllFrames).not.toHaveBeenCalled();
  });

  // 시스템 프레임 id 는 환경마다 다르다. 하드코딩하지 않고 frameType 으로 찾는다.
  it("기본 프레임은 같은 frameType 의 시스템 프레임을 찾는다", async () => {
    mockListAllFrames.mockResolvedValue([
      { frameId: 3, frameType: "CLASSIC", isSystem: false },
      { frameId: 8, frameType: "WIDE", isSystem: true },
      { frameId: 6, frameType: "CLASSIC", isSystem: true },
    ]);

    await expect(resolveComposeFrameId("classic-4", null)).resolves.toBe(6);
    await expect(resolveComposeFrameId("wide-4", null)).resolves.toBe(8);
  });

  // 서버는 목록을 최신순으로 준다. 첫 번째를 집으면 시스템 프레임이 하나 늘어나는 순간
  // 기존 사용자의 결과물이 조용히 다른 프레임으로 바뀐다.
  it("같은 종류가 여럿이면 먼저 등록된 것을 고른다", async () => {
    mockListAllFrames.mockResolvedValue([
      { frameId: 17, frameType: "CLASSIC", isSystem: true },
      { frameId: 6, frameType: "CLASSIC", isSystem: true },
    ]);

    await expect(resolveComposeFrameId("classic-4", null)).resolves.toBe(6);
  });

  it("시스템 프레임이 없으면 분명한 오류를 낸다", async () => {
    mockListAllFrames.mockResolvedValue([]);

    await expect(resolveComposeFrameId("grid-4", null)).rejects.toBeInstanceOf(
      SystemFrameMissingError,
    );
  });
});

describe("composeFourcutOnServer", () => {
  it("원본 4장을 FOURCUT_SOURCE 로 올리고 그 key 로 합성을 건다", async () => {
    mockListAllFrames.mockResolvedValue([
      { frameId: 6, frameType: "CLASSIC", isSystem: true },
    ]);

    const result = await composeFourcutOnServer({
      sources: SOURCES,
      layout,
      outputFilter: "B&W",
      frameId: "classic-4",
      remoteFrameId: null,
    });

    expect(result).toEqual({ mediaId: 42 });
    expect(mockUpload).toHaveBeenCalledTimes(4);

    for (const [args] of mockUpload.mock.calls) {
      expect(args.type).toBe("FOURCUT_SOURCE");
      // 원본은 사진이라 JPEG 으로 굽는다(PNG 면 10MB 제한에 걸린다).
      expect(args.file.type).toBe("image/jpeg");
      // 합성 원본은 곧 서버가 지우므로 조회 URL 을 따로 받지 않는다.
      expect(args.skipUrlResolve).toBe(true);
    }

    expect(mockRequestCompose).toHaveBeenCalledWith({
      frameId: 6,
      sourceKeys: [
        "uploads/users/me/fourcuts/sources/source-1.jpg",
        "uploads/users/me/fourcuts/sources/source-2.jpg",
        "uploads/users/me/fourcuts/sources/source-3.jpg",
        "uploads/users/me/fourcuts/sources/source-4.jpg",
      ],
      idempotencyKey: "web-fixed-key",
    });
  });

  it("슬롯 수와 원본 수가 다르면 올리기 전에 막는다", async () => {
    await expect(
      composeFourcutOnServer({
        sources: ["a", "b"],
        layout,
        outputFilter: "NONE",
        frameId: "classic-4",
        remoteFrameId: null,
      }),
    ).rejects.toThrow(/slot count/);

    expect(mockUpload).not.toHaveBeenCalled();
  });
});
