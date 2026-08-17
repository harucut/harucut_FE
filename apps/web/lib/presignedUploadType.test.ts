/**
 * 네컷 원본 업로드 타입 이름이 백엔드에서 개명 중이라, 어느 백엔드가 떠 있어도 통해야 한다.
 *
 * 두 백엔드를 동시에 띄우고 실측한 값(이 테스트가 지키는 사실):
 *   type=FOURCUT_PHOTO   배포본 200 / 합성 백엔드 400(GEN-006)
 *   type=FOURCUT_SOURCE  배포본 400 / 합성 백엔드 200
 */
import {
  PRESIGNED_UPLOAD_TYPES,
  resetFourcutUploadTypeCache,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";
import { clientApi } from "@/lib/clientApi";

jest.mock("@/lib/clientApi", () => ({
  clientApi: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("@/lib/userMediaApi", () => ({
  registerUserMedia: jest.fn().mockResolvedValue({ mediaId: 1, downloadUrl: null }),
}));

const mockPost = clientApi.post as jest.Mock;
const mockGet = clientApi.get as jest.Mock;

const presignOk = (type: string) => ({
  data: {
    data: {
      key: `uploads/users/me/fourcuts/sources/${type}.jpg`,
      uploadUrl: "https://s3.example.com/put?sig=1",
      contentType: "image/jpeg",
    },
  },
});

const badRequest = () => Object.assign(new Error("bad request"), { status: 400 });

function fakeFile() {
  return new File([new Uint8Array([1, 2, 3])], "cut.jpg", { type: "image/jpeg" });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFourcutUploadTypeCache();
  mockGet.mockResolvedValue({ data: { data: null } });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
});

/** 요청 본문에서 type 만 뽑는다. */
const typesSent = () => mockPost.mock.calls.map(([, body]) => (body as { type: string }).type);

describe("네컷 원본 업로드 타입", () => {
  it("새 이름(FOURCUT_SOURCE)을 먼저 시도한다", async () => {
    mockPost.mockResolvedValueOnce(presignOk("FOURCUT_SOURCE"));

    await uploadToS3WithPresigned({
      file: fakeFile(),
      type: PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO,
    });

    expect(typesSent()).toEqual(["FOURCUT_SOURCE"]);
  });

  it("새 이름이 400 이면 옛 이름으로 넘어간다 — 배포 전 백엔드에서도 올라간다", async () => {
    mockPost
      .mockRejectedValueOnce(badRequest())
      .mockResolvedValueOnce(presignOk("FOURCUT_PHOTO"));

    await uploadToS3WithPresigned({
      file: fakeFile(),
      type: PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO,
    });

    expect(typesSent()).toEqual(["FOURCUT_SOURCE", "FOURCUT_PHOTO"]);
  });

  it("한 번 통한 이름을 기억해 매번 두 번 왕복하지 않는다", async () => {
    mockPost
      .mockRejectedValueOnce(badRequest())
      .mockResolvedValueOnce(presignOk("FOURCUT_PHOTO"))
      .mockResolvedValueOnce(presignOk("FOURCUT_PHOTO"));

    await uploadToS3WithPresigned({ file: fakeFile(), type: PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO });
    await uploadToS3WithPresigned({ file: fakeFile(), type: PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO });

    expect(typesSent()).toEqual(["FOURCUT_SOURCE", "FOURCUT_PHOTO", "FOURCUT_PHOTO"]);
  });

  it("401 은 이름 문제가 아니므로 후보를 더 시도하지 않고 그대로 올린다", async () => {
    mockPost.mockRejectedValueOnce(Object.assign(new Error("unauthorized"), { status: 401 }));

    await expect(
      uploadToS3WithPresigned({ file: fakeFile(), type: PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO }),
    ).rejects.toThrow("unauthorized");

    expect(typesSent()).toEqual(["FOURCUT_SOURCE"]);
  });

  it("네컷 외 타입은 후보 순회 없이 그대로 보낸다", async () => {
    mockPost.mockResolvedValueOnce(presignOk("PROFILE"));

    await uploadToS3WithPresigned({ file: fakeFile(), type: PRESIGNED_UPLOAD_TYPES.PROFILE });

    expect(typesSent()).toEqual(["PROFILE"]);
  });
});
