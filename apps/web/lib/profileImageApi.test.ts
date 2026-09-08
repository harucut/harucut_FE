/**
 * 프로필 사진 업로드가 **거르지 않고 바꾸는지**, 그리고 **헛왕복을 안 하는지** 지킨다.
 *
 * 예전에는 `isSupportedUploadFile` 로 막기만 했다. 그러면 아이폰 기본 설정으로 찍은
 * 사진(HEIC)은 프로필로 아예 못 쓴다 — 사용자가 고를 수 있는 사진 대부분이 그것이다.
 * 지금은 `toUploadableFile` 이 백엔드가 받는 형식으로 바꿔 준다.
 *
 * 여기서 지키는 것은 세 가지다.
 *  1. 바꿀 필요가 없는 파일은 **그대로** 간다(다시 구우면 화질만 깎인다).
 *  2. 못 읽는 파일은 **올리기 전에** 예전과 같은 예외로 막힌다 — 화면의 에러 처리가
 *     그 예외 종류에 걸려 있다.
 *  3. 조회용 URL 해석은 건너뛴다 — 아무도 안 쓰는 왕복이라 되살아나면 그만큼 느려진다.
 *
 * 변환 자체(어떤 브라우저가 wasm 을 받는가·얼마나 줄이는가)는 `imageDecode.test.ts` 가
 * 본다. 여기서는 그 길로 **보내는가**만 본다.
 */
import { uploadProfileImage } from "@/lib/profileImageApi";
import { UploadValidationError } from "@/lib/presignedUploadApi";

const mockUpload = jest.fn();
const mockPatch = jest.fn();

// 형식 판정(isSupportedUploadFile)·변환(toUploadableFile)·UploadValidationError 는 진짜를
// 쓴다 — 여기서 검증하려는 것이 "그 규칙을 그대로 따르는가" 이기 때문이다. 막는 것은
// S3 왕복 하나뿐이다.
jest.mock("@/lib/presignedUploadApi", () => ({
  ...jest.requireActual("@/lib/presignedUploadApi"),
  uploadToS3WithPresigned: (...args: unknown[]) => mockUpload(...args),
}));

jest.mock("@/lib/clientApi", () => ({
  clientApi: { patch: (...args: unknown[]) => mockPatch(...args) },
}));

describe("uploadProfileImage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpload.mockResolvedValue({ key: "profile/abc.png" });
    mockPatch.mockResolvedValue({ data: { data: null } });

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
    Object.defineProperty(global, "Image", {
      configurable: true,
      value: StubImage,
    });
    Object.defineProperty(global.URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:stub",
    });
    Object.defineProperty(global.URL, "revokeObjectURL", {
      configurable: true,
      value: () => undefined,
    });
  });

  it("이미 올릴 수 있는 형식은 손대지 않고 그대로 올린다", async () => {
    const png = new File(["x"], "me.png", { type: "image/png" });

    await uploadProfileImage(png);

    // 값이 아니라 **같은 인스턴스**로 본다. 다시 구운 File 도 값 비교로는 같다고 나온다.
    expect(mockUpload.mock.calls[0][0].file).toBe(png);
  });

  /*
    프로필 업로드가 쓰는 것은 서버에 넘길 key 하나뿐이다. 바뀐 사진을 그릴 주소는
    변경 요청 뒤 다시 받아 오는 사용자 정보에서 온다 — 조회용 URL 해석이 되살아나면
    사진 한 장 바꿀 때마다 아무도 안 쓰는 왕복이 한 번 늘어난다.
  */
  it("조회용 URL 해석을 건너뛰고 받은 key 로 변경을 요청한다", async () => {
    const file = new File(["x"], "me.png", { type: "image/png" });

    await expect(uploadProfileImage(file)).resolves.toEqual({
      key: "profile/abc.png",
    });

    expect(mockUpload).toHaveBeenCalledWith({
      file,
      type: "PROFILE",
      skipUrlResolve: true,
    });
    expect(mockPatch).toHaveBeenCalledWith(
      "/api/client/user/change/profile-image",
      { s3Key: "profile/abc.png" },
    );
  });

  /*
    못 읽는 파일은 **S3 에 가기 전에** 막혀야 한다. 올린 뒤에 막으면 아무도 못 여는
    파일이 버킷에 남고, 프로필 변경 요청은 그 key 를 가리킨다. 서버가 415 로 거절하는
    것보다 빠르고, 사용자에게는 한국어 문구가 남는다.
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
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
