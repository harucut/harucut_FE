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
const mockLoadImage = jest.fn();
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
  loadImage: (...args: unknown[]) => mockLoadImage(...args),
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

  mockLoadImage.mockResolvedValue({ naturalWidth: 600, naturalHeight: 800 });
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

  // 원본은 합성이 성공해야 서버가 지운다. 그래서 "합성에 못 쓸 원본"을 S3 에 올리는 순간
  // 그건 지울 수단이 없는 고아 객체가 된다 — 프론트에 파일 삭제 엔드포인트가 없다.
  // 아래 둘은 그 고아를 만드는 두 경로를 막아 둔다.
  it("굽는 중에 한 장이 실패하면 원본을 한 장도 올리지 않는다", async () => {
    mockListAllFrames.mockResolvedValue([
      { frameId: 6, frameType: "CLASSIC", isSystem: true },
    ]);

    // 세 번째 사진만 못 읽는다. 슬롯마다 "굽기 → 올리기"를 이어 붙이면 나머지 세 장은
    // 이미 S3 로 나간 뒤라, 쓰이지도 않을 원본이 사용자 버킷에 그대로 남았다.
    mockLoadImage.mockImplementation(async (src: string) => {
      if (src === "c") throw new Error("이미지를 읽지 못했다");
      return { naturalWidth: 600, naturalHeight: 800 };
    });

    await expect(
      composeFourcutOnServer({
        sources: SOURCES,
        layout,
        outputFilter: "NONE",
        frameId: "classic-4",
        remoteFrameId: null,
      }),
    ).rejects.toThrow("이미지를 읽지 못했다");

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRequestCompose).not.toHaveBeenCalled();
  });

  it("한 장이 실패해도 나머지 업로드가 끝난 뒤에 알리고 남은 key 를 흘리지 않는다", async () => {
    mockListAllFrames.mockResolvedValue([
      { frameId: 6, frameType: "CLASSIC", isSystem: true },
    ]);

    const uploadError = new Error("S3 upload failed: 500");
    const finished: string[] = [];
    let releaseRest = () => {};
    const rest = new Promise<void>((resolve) => {
      releaseRest = resolve;
    });

    mockUpload.mockImplementation(async ({ file }: { file: File }) => {
      if (file.name === "source-1.jpg") throw uploadError;
      await rest;
      finished.push(file.name);
      return { key: `uploads/users/me/fourcuts/sources/${file.name}` };
    });

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const settled: string[] = [];
    const pending = composeFourcutOnServer({
      sources: SOURCES,
      layout,
      outputFilter: "NONE",
      frameId: "classic-4",
      remoteFrameId: null,
    }).catch((error: unknown) => {
      settled.push("rejected");
      return error;
    });

    // 남은 세 장이 아직 올라가는 중이다. 여기서 먼저 빠져나가면 그 key 를 영영 모르고,
    // 사용자가 곧바로 재시도하면 끝나지 않은 업로드 위에 4장이 또 겹친다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toEqual([]);

    releaseRest();

    // 오류는 감싸지 않고 그대로 올린다 — describeComposeFailure 가 에러 코드로 분기한다.
    await expect(pending).resolves.toBe(uploadError);
    expect(finished).toHaveLength(3);

    // key 가 모자라니 합성은 접수하지 않는다.
    expect(mockRequestCompose).not.toHaveBeenCalled();

    // 지울 수단이 없으니 남은 key 는 로그로라도 남긴다(삭제 API 가 열리면 여기서 부른다).
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("source-2.jpg"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("source-4.jpg"));

    warn.mockRestore();
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
