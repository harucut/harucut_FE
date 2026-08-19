/**
 * presigned 발급 요청이 새 백엔드 계약과 맞는지 지킨다.
 *
 * 2026-08-20 실측(docs/backend-contract.md):
 *   type=FOURCUT_PHOTO           → 400 GEN-006 (더 이상 없는 이름)
 *   type=FOURCUT_SOURCE          → 200
 *   fileSize 누락                → 400 GEN-003 "파일 크기는 필수입니다."
 *
 * 그래서 (1) 이름은 FOURCUT_SOURCE 하나로 고정하고 두 이름을 번갈아 시도하지 않으며,
 * (2) fileSize 를 반드시 실어 보낸다.
 */
import {
  MAX_UPLOAD_BYTES,
  PRESIGNED_UPLOAD_TYPES,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";
import { clientApi } from "@/lib/clientApi";

jest.mock("@/lib/clientApi", () => ({
  clientApi: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("@/lib/userMediaApi", () => ({
  registerUserMedia: jest
    .fn()
    .mockResolvedValue({ mediaId: 1, downloadUrl: null }),
}));

const mockPost = clientApi.post as jest.Mock;
const mockGet = clientApi.get as jest.Mock;

const presignOk = () => ({
  data: {
    data: {
      key: "uploads/users/me/fourcuts/sources/abc.jpg",
      uploadUrl: "https://s3.example.com/put?sig=1",
      contentType: "image/jpeg",
    },
  },
});

function fakeFile(size = 3) {
  const file = new File([new Uint8Array(size)], "cut.jpg", {
    type: "image/jpeg",
  });
  return file;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({ data: { data: null } });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
});

const bodiesSent = () =>
  mockPost.mock.calls.map(
    ([, body]) => body as { type: string; fileSize?: number },
  );

describe("presigned 발급 요청", () => {
  it("네컷 원본은 FOURCUT_SOURCE 한 번만 보낸다", async () => {
    mockPost.mockResolvedValueOnce(presignOk());

    await uploadToS3WithPresigned({
      file: fakeFile(),
      type: PRESIGNED_UPLOAD_TYPES.FOURCUT_SOURCE,
    });

    expect(bodiesSent().map((b) => b.type)).toEqual(["FOURCUT_SOURCE"]);
  });

  it("fileSize 로 실제 파일 크기를 싣는다", async () => {
    mockPost.mockResolvedValueOnce(presignOk());
    const file = fakeFile(1234);

    await uploadToS3WithPresigned({
      file,
      type: PRESIGNED_UPLOAD_TYPES.PROFILE,
    });

    expect(bodiesSent()[0]).toMatchObject({
      type: "PROFILE",
      fileSize: file.size,
    });
    expect(file.size).toBe(1234);
  });

  // 400 을 "서버가 모르는 타입 이름"으로 오해해 다른 이름으로 재시도하던 폴백을 걷어냈다.
  // 검증 실패는 그대로 올라와야 화면이 제 문구를 띄운다.
  it("400 이 나도 다른 타입 이름으로 재시도하지 않는다", async () => {
    mockPost.mockRejectedValueOnce(
      Object.assign(new Error("bad request"), { status: 400 }),
    );

    await expect(
      uploadToS3WithPresigned({
        file: fakeFile(),
        type: PRESIGNED_UPLOAD_TYPES.FOURCUT_SOURCE,
      }),
    ).rejects.toBeDefined();

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("10MB 를 넘으면 발급 요청 자체를 하지 않는다", async () => {
    await expect(
      uploadToS3WithPresigned({
        file: fakeFile(MAX_UPLOAD_BYTES + 1),
        type: PRESIGNED_UPLOAD_TYPES.FOURCUT_SOURCE,
      }),
    ).rejects.toThrow(/10MB/);

    expect(mockPost).not.toHaveBeenCalled();
  });
});
