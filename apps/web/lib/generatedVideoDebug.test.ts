import {
  registerGeneratedWebmDebug,
  unregisterGeneratedWebmDebug,
} from "@/lib/generatedVideoDebug";

describe("generated video debug helpers", () => {
  const mockCreateObjectURL = jest.fn();
  const mockRevokeObjectURL = jest.fn();
  const mockWindowOpen = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue("blob:debug-webm");
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;
    window.open = mockWindowOpen;
  });

  it("registers global download and open commands for the latest generated webm", () => {
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    const url = registerGeneratedWebmDebug({
      scope: "upload-result",
      blob: new Blob(["video"], { type: "video/webm" }),
      filename: "debug.webm",
    });

    expect(url).toBe("blob:debug-webm");
    expect(typeof window.downloadHarucutGeneratedWebm).toBe("function");
    expect(typeof window.openHarucutGeneratedWebm).toBe("function");

    window.downloadHarucutGeneratedWebm?.();
    expect(clickSpy).toHaveBeenCalled();

    window.openHarucutGeneratedWebm?.();
    expect(mockWindowOpen).toHaveBeenCalledWith(
      "blob:debug-webm",
      "_blank",
      "noopener",
    );

    clickSpy.mockRestore();
  });

  it("cleans up global commands when the scoped debug entry is removed", () => {
    registerGeneratedWebmDebug({
      scope: "upload-result",
      blob: new Blob(["video"], { type: "video/webm" }),
      filename: "debug.webm",
    });

    unregisterGeneratedWebmDebug("upload-result", "blob:debug-webm");

    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:debug-webm");
    expect(window.downloadHarucutGeneratedWebm).toBeUndefined();
    expect(window.openHarucutGeneratedWebm).toBeUndefined();
    expect(window.__harucutGeneratedWebm).toBeUndefined();
  });
});
