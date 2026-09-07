/**
 * 프로필 사진 업로드가 **거르지 않고 바꾸는지** 지킨다.
 *
 * 예전에는 `isSupportedUploadFile` 로 막기만 했다. 그러면 아이폰 기본 설정으로 찍은
 * 사진(HEIC)은 프로필로 아예 못 쓴다 — 사용자가 고를 수 있는 사진 대부분이 그것이다.
 * 지금은 `toUploadableFile` 이 백엔드가 받는 형식으로 바꿔 준다.
 *
 * 여기서 지키는 것은 두 가지다.
 *  1. 바꿀 필요가 없는 파일은 **그대로** 간다(다시 구우면 화질만 깎인다).
 *  2. 못 읽는 파일은 **올리기 전에** 예전과 같은 예외로 막힌다 — 화면의 에러 처리가
 *     그 예외 종류에 걸려 있다.
 */
import { uploadProfileImage } from "@/lib/profileImageApi";
import { UploadValidationError } from "@/lib/presignedUploadApi";

const mockUpload = jest.fn();
const mockPatch = jest.fn();

jest.mock("@/lib/presignedUploadApi", () => {
  const actual = jest.requireActual("@/lib/presignedUploadApi");
  return {
    ...actual,
    uploadToS3WithPresigned: (...args: unknown[]) => mockUpload(...args),
  };
});

jest.mock("@/lib/clientApi", () => ({
  clientApi: { patch: (...args: unknown[]) => mockPatch(...args) },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockResolvedValue({ key: "profile/abc.png" });
  mockPatch.mockResolvedValue(undefined);

  // 브라우저가 못 읽는 상황. jsdom 은 <img> 를 아예 받으러 가지 않아 아무 이벤트도
  // 안 오므로, 실제 브라우저처럼 `onerror` 를 주도록 맞춘다.
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    set src(_value: string) {
      queueMicrotask(() => this.onerror?.());
    }
  }
  Object.defineProperty(global, "Image", { configurable: true, value: StubImage });
  Object.defineProperty(global.URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:stub",
  });
  Object.defineProperty(global.URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined,
  });
});

describe("uploadProfileImage", () => {
  it("이미 올릴 수 있는 형식은 손대지 않고 그대로 올린다", async () => {
    const png = new File(["x"], "me.png", { type: "image/png" });

    await uploadProfileImage(png);

    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({ file: png, type: "PROFILE" }),
    );
  });

  it("올린 key 로 프로필 변경을 요청한다", async () => {
    await uploadProfileImage(new File(["x"], "me.png", { type: "image/png" }));

    expect(mockPatch).toHaveBeenCalledWith(
      "/api/client/user/change/profile-image",
      { s3Key: "profile/abc.png" },
    );
  });

  /*
    못 읽는 파일은 **S3 에 가기 전에** 막혀야 한다. 올린 뒤에 막으면 아무도 못 여는
    파일이 버킷에 남고, 프로필 변경 요청은 그 key 를 가리킨다.
  */
  it("못 읽는 형식이면 올리지 않고 업로드 검증 예외를 던진다", async () => {
    const weird = new File(["x"], "clip.mp4", { type: "video/mp4" });

    await expect(uploadProfileImage(weird)).rejects.toBeInstanceOf(
      UploadValidationError,
    );
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("파일이 없으면 올리지 않는다", async () => {
    await expect(
      uploadProfileImage(undefined as unknown as File),
    ).rejects.toBeInstanceOf(UploadValidationError);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
