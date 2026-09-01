/**
 * 서버 합성 오케스트레이션이 계약대로 움직이는지 지킨다.
 *
 * 실측 근거(docs/backend-contract.md):
 *  - 원본은 `type: FOURCUT_SOURCE` 로 올린다
 *  - 필터는 **서버가 모른다** — 올리기 전에 픽셀에 구워야 한다
 *  - 누끼도 **서버가 안 그린다** — 켠 칸은 올리기 전에 픽셀에 구워야 한다
 *  - `frameId` 는 내 프레임이거나 **시스템 프레임**이어야 한다
 *
 * 누끼 모델(MediaPipe wasm)은 jsdom 에서 못 돈다. 그래서 여기서 지키는 것은 **배선**이다 —
 * 켠 칸만 굽는가, 실패하면 원본으로 가는가, 순서가 유지되는가, key 는 4개인가.
 * 모델 자체는 `lib/canvas/personCutout.test.ts` 가 본다.
 */
import {
  composeFourcutOnServer,
  resolveComposeFrame,
  SystemFrameMissingError,
} from "@/lib/fourcutCompose";

const mockListAllFrames = jest.fn();
const mockGetFrame = jest.fn();
const mockLoadImage = jest.fn();
const mockUpload = jest.fn();
const mockRequestCompose = jest.fn();
const mockWaitForCompose = jest.fn();
const mockCutout = jest.fn();

jest.mock("@/lib/remoteFrameApi", () => ({
  listAllFrames: (...args: unknown[]) => mockListAllFrames(...args),
  getFrame: (...args: unknown[]) => mockGetFrame(...args),
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

// 모델은 못 돌리므로 계약만 흉내낸다: 성공하면 Blob, 실패하면 `reason` 을 단 에러.
jest.mock("@/lib/canvas/personCutout", () => ({
  cutoutPersonOnBlack: (...args: unknown[]) => mockCutout(...args),
  isPersonCutoutUnavailable: (error: unknown) =>
    error instanceof Error && "reason" in error,
}));

/** `personCutout` 이 던지는 "원본으로 돌아가라" 에러. */
class FakeCutoutError extends Error {
  constructor(readonly reason: string) {
    super("누끼를 만들지 못했어요.");
    this.name = "PersonCutoutUnavailableError";
  }
}

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

/** 굽기에 실제로 넘어간 주소. 원본이면 원본 문자열, 누끼면 blob URL 이 보인다. */
function bakedSources() {
  return mockLoadImage.mock.calls.map(([src]) => src as string);
}

/** 세그멘테이션이 동시에 몇 개까지 겹쳤나. 순차면 1 이다. */
let peakCutoutConcurrency = 0;
let revokedUrls: string[] = [];

/** 어느 원본에서 나온 blob 인지. objectURL 주소에 그대로 적어 굽기까지 따라간다. */
let cutoutOf: WeakMap<Blob, string>;

function cutoutResultFor(src: string) {
  const blob = new Blob(["cutout"], { type: "image/jpeg" });
  cutoutOf.set(blob, src);
  return { blob, width: 1700, height: 1200, personPixels: 1234 };
}

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

  // jsdom 에는 objectURL 이 없다. 어느 원본에서 나온 blob 인지 주소에 적어 두면
  // "누끼가 구워진 픽셀이 굽기로 넘어갔는가"를 그대로 읽을 수 있다.
  cutoutOf = new WeakMap<Blob, string>();
  revokedUrls = [];
  URL.createObjectURL = jest.fn(
    (blob: Blob) => `blob:cutout-of-${cutoutOf.get(blob) ?? "unknown"}`,
  ) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = jest.fn((url: string) => {
    revokedUrls.push(url);
  }) as unknown as typeof URL.revokeObjectURL;

  peakCutoutConcurrency = 0;
  let running = 0;
  mockCutout.mockImplementation(async (src: string) => {
    running += 1;
    peakCutoutConcurrency = Math.max(peakCutoutConcurrency, running);
    // 실제 세그멘테이션은 장당 450ms 다. 동시에 걸리면 여기서 겹친다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    running -= 1;

    return cutoutResultFor(src);
  });

  mockGetFrame.mockResolvedValue({
    frameId: 99,
    frameType: "CLASSIC",
    components: [],
  });
  mockLoadImage.mockResolvedValue({ naturalWidth: 600, naturalHeight: 800 });
  mockUpload.mockImplementation(async ({ file }: { file: File }) => ({
    key: `uploads/users/me/fourcuts/sources/${file.name}`,
  }));
  mockRequestCompose.mockResolvedValue({ jobId: 7, status: "PENDING" });
  mockWaitForCompose.mockResolvedValue({ jobId: 7, status: "DONE", mediaId: 42 });
});

describe("resolveComposeFrame", () => {
  it("내가 만든 프레임을 골랐으면 그 id 를 그대로 쓴다", async () => {
    await expect(resolveComposeFrame("classic-4", 99)).resolves.toEqual({
      frameId: 99,
      cellCutouts: [false, false, false, false],
    });
    expect(mockListAllFrames).not.toHaveBeenCalled();
  });

  // 누끼 토글은 프레임에만 있다. 세션은 id 만 들고 다니므로 여기서 읽어 굽기로 넘긴다.
  it("꾸민 프레임의 누끼 토글을 같이 돌려준다", async () => {
    mockGetFrame.mockResolvedValue({
      frameId: 99,
      frameType: "CLASSIC",
      cellCutouts: [true, false, true, false],
      components: [],
    });

    await expect(resolveComposeFrame("classic-4", 99)).resolves.toEqual({
      frameId: 99,
      cellCutouts: [true, false, true, false],
    });
    expect(mockGetFrame).toHaveBeenCalledWith(99);
  });

  // 스웨거의 생략 규칙: 안 왔거나 4개가 아니면 전부 꺼진 것이다(구 프레임).
  it("누끼가 4개가 아니면 전부 꺼진 것으로 본다", async () => {
    mockGetFrame.mockResolvedValue({
      frameId: 99,
      frameType: "CLASSIC",
      cellCutouts: [true, true],
      components: [],
    });

    await expect(resolveComposeFrame("classic-4", 99)).resolves.toEqual({
      frameId: 99,
      cellCutouts: [false, false, false, false],
    });
  });

  // 조회 한 번이 흔들렸다고 지금까지 되던 저장을 죽이지 않는다. 누끼만 포기한다.
  it("프레임 조회가 실패해도 id 는 살리고 누끼만 끈다", async () => {
    mockGetFrame.mockRejectedValue(new Error("network down"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(resolveComposeFrame("classic-4", 99)).resolves.toEqual({
      frameId: 99,
      cellCutouts: [false, false, false, false],
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("누끼 없이 간다"),
      expect.any(Error),
    );

    warn.mockRestore();
  });

  // 시스템 프레임 id 는 환경마다 다르다. 하드코딩하지 않고 frameType 으로 찾는다.
  it("기본 프레임은 같은 frameType 의 시스템 프레임을 찾는다", async () => {
    mockListAllFrames.mockResolvedValue([
      { frameId: 3, frameType: "CLASSIC", isSystem: false },
      { frameId: 8, frameType: "WIDE", isSystem: true },
      { frameId: 6, frameType: "CLASSIC", isSystem: true },
    ]);

    await expect(resolveComposeFrame("classic-4", null)).resolves.toMatchObject({
      frameId: 6,
    });
    await expect(resolveComposeFrame("wide-4", null)).resolves.toMatchObject({
      frameId: 8,
    });
    // 목록에 이미 들어 있는 값이라 프레임을 한 번 더 묻지 않는다.
    expect(mockGetFrame).not.toHaveBeenCalled();
  });

  it("시스템 프레임의 누끼 토글도 목록에서 그대로 읽는다", async () => {
    mockListAllFrames.mockResolvedValue([
      {
        frameId: 6,
        frameType: "CLASSIC",
        isSystem: true,
        cellCutouts: [false, true, false, true],
      },
    ]);

    await expect(resolveComposeFrame("classic-4", null)).resolves.toEqual({
      frameId: 6,
      cellCutouts: [false, true, false, true],
    });
  });

  // 서버는 목록을 최신순으로 준다. 첫 번째를 집으면 시스템 프레임이 하나 늘어나는 순간
  // 기존 사용자의 결과물이 조용히 다른 프레임으로 바뀐다.
  it("같은 종류가 여럿이면 먼저 등록된 것을 고른다", async () => {
    mockListAllFrames.mockResolvedValue([
      { frameId: 17, frameType: "CLASSIC", isSystem: true },
      { frameId: 6, frameType: "CLASSIC", isSystem: true },
    ]);

    await expect(resolveComposeFrame("classic-4", null)).resolves.toMatchObject({
      frameId: 6,
    });
  });

  it("시스템 프레임이 없으면 분명한 오류를 낸다", async () => {
    mockListAllFrames.mockResolvedValue([]);

    await expect(resolveComposeFrame("grid-4", null)).rejects.toBeInstanceOf(
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

  it("누끼가 다 꺼져 있으면 모델을 부르지 않는다", async () => {
    mockListAllFrames.mockResolvedValue([
      { frameId: 6, frameType: "CLASSIC", isSystem: true },
    ]);

    await composeFourcutOnServer({
      sources: SOURCES,
      layout,
      outputFilter: "NONE",
      frameId: "classic-4",
      remoteFrameId: null,
    });

    expect(mockCutout).not.toHaveBeenCalled();
    expect(bakedSources()).toEqual(SOURCES);
  });
});

/**
 * 스웨거가 못박은 것: **서버는 `cellCutouts` 로 아무것도 그리지 않는다.**
 * 그래서 켠 칸의 픽셀은 올리기 전에 여기서 바뀌어 있어야 한다.
 */
describe("composeFourcutOnServer — 누끼를 원본 픽셀에 굽는다", () => {
  beforeEach(() => {
    mockGetFrame.mockResolvedValue({
      frameId: 99,
      frameType: "CLASSIC",
      cellCutouts: [true, false, true, false],
      components: [],
    });
  });

  it("켠 칸만 누끼를 굽고 끈 칸은 원본 그대로 간다", async () => {
    await composeFourcutOnServer({
      sources: SOURCES,
      layout,
      outputFilter: "NONE",
      frameId: "classic-4",
      remoteFrameId: 99,
    });

    // 모델은 켠 칸에만, 원본 그대로 들어간다(자르기·필터 전이라 손대지 않은 사진이다).
    expect(mockCutout).toHaveBeenCalledTimes(2);
    expect(mockCutout.mock.calls.map(([src]) => src)).toEqual(["a", "c"]);

    // 켠 칸의 굽기에는 원본이 아니라 누끼 결과가 넘어간다. 순서는 슬롯 순서 그대로다.
    expect(bakedSources()).toEqual([
      "blob:cutout-of-a",
      "b",
      "blob:cutout-of-c",
      "d",
    ]);
  });

  // 실측 450ms/장. `delegate:'CPU'` 라 wasm 이 메인 스레드에서 동기로 돌아 같이 걸어도
  // 빨라지지 않고, 1700×1700 RGBA 11.6MB 버퍼만 네 벌 동시에 산다.
  it("모델은 한 장씩 돈다", async () => {
    await composeFourcutOnServer({
      sources: SOURCES,
      layout,
      outputFilter: "NONE",
      frameId: "classic-4",
      remoteFrameId: 99,
    });

    expect(peakCutoutConcurrency).toBe(1);
  });

  it("누끼를 켜도 올라가는 key 는 슬롯 순서로 정확히 4개다", async () => {
    await composeFourcutOnServer({
      sources: SOURCES,
      layout,
      outputFilter: "NONE",
      frameId: "classic-4",
      remoteFrameId: 99,
    });

    expect(mockUpload).toHaveBeenCalledTimes(4);
    expect(mockRequestCompose).toHaveBeenCalledWith({
      frameId: 99,
      sourceKeys: [
        "uploads/users/me/fourcuts/sources/source-1.jpg",
        "uploads/users/me/fourcuts/sources/source-2.jpg",
        "uploads/users/me/fourcuts/sources/source-3.jpg",
        "uploads/users/me/fourcuts/sources/source-4.jpg",
      ],
      idempotencyKey: "web-fixed-key",
    });
  });

  // 누끼 하나 때문에 촬영 전체를 잃지 않는다.
  it("한 칸의 누끼가 실패하면 그 칸만 원본으로 올린다", async () => {
    mockCutout.mockImplementation(async (src: string) => {
      if (src === "a") throw new FakeCutoutError("model-load");
      return cutoutResultFor(src);
    });

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await composeFourcutOnServer({
      sources: SOURCES,
      layout,
      outputFilter: "NONE",
      frameId: "classic-4",
      remoteFrameId: 99,
    });

    // 촬영은 그대로 끝난다.
    expect(result).toEqual({ mediaId: 42 });
    expect(mockUpload).toHaveBeenCalledTimes(4);
    expect(bakedSources()).toEqual(["a", "b", "blob:cutout-of-c", "d"]);

    // 조용히 넘어가지 않는다 — 왜 안 됐는지 개발 로그에 사유가 남는다.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("model-load"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("1번째"));

    warn.mockRestore();
  });

  it("모델이 통째로 죽어도 네 장 다 원본으로 올라간다", async () => {
    mockCutout.mockRejectedValue(new FakeCutoutError("model-load"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      composeFourcutOnServer({
        sources: SOURCES,
        layout,
        outputFilter: "NONE",
        frameId: "classic-4",
        remoteFrameId: 99,
      }),
    ).resolves.toEqual({ mediaId: 42 });

    expect(bakedSources()).toEqual(SOURCES);
    expect(mockUpload).toHaveBeenCalledTimes(4);

    warn.mockRestore();
  });

  // 누끼는 **굽기 쪽**이다. 올리는 중간에 뜨면 한 장이 어긋나는 순간 절반만 올라간다.
  it("굽는 중에 한 장이 실패하면 누끼를 켰어도 한 장도 올리지 않는다", async () => {
    mockLoadImage.mockImplementation(async (src: string) => {
      if (src === "b") throw new Error("이미지를 읽지 못했다");
      return { naturalWidth: 600, naturalHeight: 800 };
    });

    await expect(
      composeFourcutOnServer({
        sources: SOURCES,
        layout,
        outputFilter: "NONE",
        frameId: "classic-4",
        remoteFrameId: 99,
      }),
    ).rejects.toThrow("이미지를 읽지 못했다");

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRequestCompose).not.toHaveBeenCalled();
  });

  // blob 은 탭이 닫힐 때까지 산다. 실패해도 돌려준다.
  it("중간 blob 은 다 쓰고 되돌려 준다", async () => {
    await composeFourcutOnServer({
      sources: SOURCES,
      layout,
      outputFilter: "NONE",
      frameId: "classic-4",
      remoteFrameId: 99,
    });

    expect(revokedUrls.sort()).toEqual([
      "blob:cutout-of-a",
      "blob:cutout-of-c",
    ]);
  });
});

describe("composeFourcutOnServer — 올리기", () => {
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
    expect(mockCutout).not.toHaveBeenCalled();
  });
});
