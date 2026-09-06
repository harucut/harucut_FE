import { uploadProfileImage } from "@/lib/profileImageApi";

const mockUpload = jest.fn();
const mockPatch = jest.fn();

jest.mock("@/lib/clientApi", () => ({
  clientApi: {
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

// 형식 판정(isSupportedUploadFile)과 UploadValidationError 는 진짜를 쓴다 —
// 여기서 검증하려는 것이 "그 규칙을 그대로 따르는가" 이기 때문이다.
jest.mock("@/lib/presignedUploadApi", () => ({
  ...jest.requireActual("@/lib/presignedUploadApi"),
  uploadToS3WithPresigned: (...args: unknown[]) => mockUpload(...args),
}));

const { UploadValidationError } = jest.requireActual(
  "@/lib/presignedUploadApi",
) as { UploadValidationError: new (message: string) => Error };

describe("uploadProfileImage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpload.mockResolvedValue({ key: "profile-key" });
    mockPatch.mockResolvedValue({ data: { data: null } });
  });

  /*
    프로필 업로드가 쓰는 것은 서버에 넘길 key 하나뿐이다. 바뀐 사진을 그릴 주소는
    변경 요청 뒤 다시 받아 오는 사용자 정보에서 온다 — 조회용 URL 해석이 되살아나면
    사진 한 장 바꿀 때마다 아무도 안 쓰는 왕복이 한 번 늘어난다.
  */
  it("조회용 URL 해석을 건너뛰고 받은 key 로 변경을 요청한다", async () => {
    const file = new File(["x"], "me.png", { type: "image/png" });

    await expect(uploadProfileImage(file)).resolves.toEqual({
      key: "profile-key",
    });

    expect(mockUpload).toHaveBeenCalledWith({
      file,
      type: "PROFILE",
      skipUrlResolve: true,
    });
    expect(mockPatch).toHaveBeenCalledWith(
      "/api/client/user/change/profile-image",
      { s3Key: "profile-key" },
    );
  });

  // 지원하지 않는 형식은 presign 을 받기 전에 막는다(서버가 415 로 거절하는 것보다 빠르고,
  // 사용자에게는 한국어 문구가 남는다).
  it("지원하지 않는 형식은 올리지 않는다", async () => {
    const file = new File(["x"], "me.heic", { type: "image/heic" });

    await expect(uploadProfileImage(file)).rejects.toBeInstanceOf(
      UploadValidationError,
    );
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
