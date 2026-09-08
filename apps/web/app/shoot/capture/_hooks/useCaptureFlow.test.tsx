/**
 * 촬영본의 **출력 크기**를 고정한다.
 *
 * 이 PR 이 카메라에 4K 를 요청하고 스틸 촬영(ImageCapture.takePhoto)을 붙이면서, 잘라낸
 * 조각이 6~9MP 까지 커졌다. 그걸 원시 크기 그대로 data URL 로 담으면 8장이 세션에 쌓이고,
 * 비회원이 고른 4장은 localStorage 인계(lib/pendingGuestSave.ts)에서 한도에 걸린다.
 * 그런데 최종 슬롯의 긴 변은 2400px 이라 넘치는 화소는 합성 단계에서 어차피 버려진다.
 *
 * 반대 방향도 같이 막는다. 상한을 슬롯 아래로 잡으면 합성 단계가 도로 확대하므로
 * (lib/fourcutCompose.ts renderSourceForSlot), 이 PR 이 해상도를 올린 이유가 사라진다.
 * 그래서 "슬롯보다 크지 않다"와 "슬롯보다 작게 줄이지 않는다"를 함께 본다.
 *
 * 훅은 video·canvas 를 ref 로만 만진다(실제 화면에서는 page.tsx 가 붙인다). 그래서 jsdom 의
 * 2d 컨텍스트 없이, ref 에 가짜를 꽂아 drawImage 인자와 캔버스 치수를 그대로 읽는다.
 * `window.ImageCapture` 는 jsdom 에 없어서 스틸 경로는 자동으로 꺼지고 영상 프레임 경로로 간다.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCaptureFlow } from "@/app/shoot/capture/_hooks/useCaptureFlow";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import type { FrameId } from "@/constants/frames";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAddShotPhoto = jest.fn();
const mockResetShots = jest.fn();
const mockSetNotice = jest.fn();

// 훅이 읽는 프레임. 레이아웃마다 슬롯 치수가 달라서 케이스별로 갈아 끼운다.
let mockFrameId: FrameId = "grid-4";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock("@/lib/shootSessionStore", () => ({
  useShootSession: () => ({
    frameId: mockFrameId,
    addShotPhoto: (...args: unknown[]) => mockAddShotPhoto(...args),
    resetShots: () => mockResetShots(),
  }),
}));

jest.mock("@/lib/guestTrialStore", () => ({
  useGuestTrialStore: (selector: (state: { setNotice: unknown }) => unknown) =>
    selector({ setNotice: mockSetNotice }),
}));

type DrawCall = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dw: number;
  dh: number;
};

function createFakeCanvas() {
  const draws: DrawCall[] = [];

  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    drawImage: (
      _source: unknown,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      _dx: number,
      _dy: number,
      dw: number,
      dh: number,
    ) => {
      draws.push({ sx, sy, sw, sh, dw, dh });
    },
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (callback: (blob: Blob | null) => void) => {
      callback(new Blob(["jpeg"], { type: "image/jpeg" }));
    },
  };

  return { canvas, draws };
}

function createFakeVideo(videoWidth: number, videoHeight: number) {
  return {
    videoWidth,
    videoHeight,
    srcObject: null as unknown,
    play: () => Promise.resolve(),
  };
}

function installCamera(width: number, height: number) {
  const track = {
    stop: jest.fn(),
    getSettings: () => ({ width, height }),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
  });
}

/** 한 컷을 실제 흐름 그대로 찍고(카메라 켜기 → 촬영 시작 → 즉시 촬영) 캔버스를 돌려준다. */
async function captureOneShot(videoWidth: number, videoHeight: number) {
  installCamera(videoWidth, videoHeight);

  const { canvas, draws } = createFakeCanvas();
  const video = createFakeVideo(videoWidth, videoHeight);

  const { result } = renderHook(() => useCaptureFlow());

  result.current.videoRef.current = video as unknown as HTMLVideoElement;
  result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

  await act(async () => {
    await result.current.startCamera();
  });

  act(() => {
    result.current.startShooting();
  });

  act(() => {
    result.current.handleShootNow();
  });

  // toBlob → FileReader 는 비동기라 사진이 세션에 담길 때까지 기다린다.
  await waitFor(() => expect(mockAddShotPhoto).toHaveBeenCalledTimes(1));

  return { canvas, draws };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFrameId = "grid-4";
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("useCaptureFlow 촬영본 크기", () => {
  const frameIds = Object.keys(FRAME_LAYOUTS) as FrameId[];

  it.each(frameIds)(
    "%s: 4K 촬영본을 슬롯 크기로 줄여 담는다",
    async (frameId) => {
      mockFrameId = frameId;
      const slot = FRAME_LAYOUTS[frameId].slots[0];

      // 훅이 요청하는 그대로 — 세로 슬롯이면 세로 4K, 가로 슬롯이면 가로 4K.
      const portrait = slot.height > slot.width;
      const { canvas } = await captureOneShot(
        portrait ? 2160 : 3840,
        portrait ? 3840 : 2160,
      );

      expect(canvas.width).toBe(slot.width);
      expect(canvas.height).toBe(slot.height);
    },
  );

  it("자르기 좌표는 그대로 두고 캔버스만 줄인다", async () => {
    const slot = FRAME_LAYOUTS["grid-4"].slots[0];
    const { canvas, draws } = await captureOneShot(2160, 3840);

    // 세로 4K 에서 슬롯 비율(1700:2400)로 가운데를 잘라낸 값. 이 조각이 달라지면
    // 화면에서 본 화각과 결과물이 어긋난다 — 줄이는 것은 그릇뿐이어야 한다.
    const expectedHeight = 2160 / (slot.width / slot.height);
    expect(draws).toHaveLength(1);
    expect(draws[0].sx).toBe(0);
    expect(draws[0].sy).toBeCloseTo((3840 - expectedHeight) / 2, 3);
    expect(draws[0].sw).toBe(2160);
    expect(draws[0].sh).toBeCloseTo(expectedHeight, 3);

    // 그리는 목적지는 줄어든 캔버스 전체.
    expect(draws[0].dw).toBe(canvas.width);
    expect(draws[0].dh).toBe(canvas.height);
    expect(canvas.width).toBe(slot.width);
  });

  it("슬롯보다 작은 촬영본은 확대하지 않는다", async () => {
    // 4K 를 못 주는 기기. 여기서 슬롯 크기로 늘리면 합성 단계의 확대를 앞당길 뿐이다.
    const slot = FRAME_LAYOUTS["grid-4"].slots[0];
    const { canvas } = await captureOneShot(480, 640);

    expect(canvas.height).toBe(640);
    expect(canvas.width).toBe(Math.round(640 * (slot.width / slot.height)));
    expect(canvas.width).toBeLessThan(slot.width);
  });
});

/**
 * 인코딩이 실패한 컷.
 *
 * `toBlob` 은 메모리가 모자라면 빈손으로 끝난다(안드로이드 연사 중에 실제로 난다).
 * 예전에는 그때 선점만 되돌리고 아무 상태도 바꾸지 않아 카운트다운 effect 가 다시 돌
 * 이유가 없었다 — 화면은 "1" 에서 멎고 게이지도 멈춘 채 아무 말이 없었다.
 */
describe("useCaptureFlow 촬영 실패", () => {
  /**
   * 실패를 끼워 넣을 수 있는 가짜 캔버스.
   * - failBlobTimes: 앞에서부터 이 횟수만큼 toBlob 이 빈손으로 끝난다.
   * - throwDrawTimes: 앞에서부터 이 횟수만큼 drawImage 가 던진다.
   */
  function createFlakyCanvas({ failBlobTimes = 0, throwDrawTimes = 0 } = {}) {
    let blobCalls = 0;
    let drawCalls = 0;

    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      scale: () => undefined,
      drawImage: () => {
        drawCalls += 1;
        if (drawCalls <= throwDrawTimes) throw new Error("draw failed");
      },
    };

    return {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (callback: (blob: Blob | null) => void) => {
        blobCalls += 1;
        callback(
          blobCalls <= failBlobTimes
            ? null
            : new Blob(["jpeg"], { type: "image/jpeg" }),
        );
      },
    };
  }

  /**
   * jsdom 의 FileReader 는 비동기라 가짜 타이머 아래에서 콜백이 오지 않는다.
   * 여기서 보는 것은 실패한 뒤의 흐름이지 인코딩 자체가 아니므로 동기로 대신한다.
   */
  class SyncFileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    readAsDataURL() {
      this.result = "data:image/jpeg;base64,shot";
      this.onload?.();
    }
  }

  const globalWithReader = globalThis as unknown as { FileReader: unknown };
  const realFileReader = globalWithReader.FileReader;

  beforeEach(() => {
    jest.useFakeTimers();
    globalWithReader.FileReader = SyncFileReader;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalWithReader.FileReader = realFileReader;
  });

  /** 카메라를 켜고 자동 촬영을 시작한 상태까지 간다. */
  async function startAutoShooting(canvas: ReturnType<typeof createFlakyCanvas>) {
    installCamera(2160, 3840);
    const video = createFakeVideo(2160, 3840);

    const { result } = renderHook(() => useCaptureFlow());

    result.current.videoRef.current = video as unknown as HTMLVideoElement;
    result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => {
      await result.current.startCamera();
    });

    act(() => {
      result.current.startShooting();
    });

    return result;
  }

  /** 캡처는 await 를 몇 겹 지나므로 타이머를 흘린 뒤 마이크로태스크까지 비운다. */
  async function flushMicrotasks() {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  }

  /** 기본 간격(3초) 하나를 흘려 컷 하나를 시도하게 한다. */
  async function runOneInterval() {
    for (let second = 0; second < 3; second += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
        await flushMicrotasks();
      });
    }
  }

  it("한 컷이 실패하면 다음 간격에 같은 컷을 다시 찍는다", async () => {
    const result = await startAutoShooting(
      createFlakyCanvas({ failBlobTimes: 1 }),
    );

    await runOneInterval();

    // 실패한 컷은 담기지 않지만 촬영은 살아 있고 카운트다운이 처음으로 돌아간다.
    expect(mockAddShotPhoto).not.toHaveBeenCalled();
    expect(result.current.isShooting).toBe(true);
    expect(result.current.countdown).toBe(3);
    expect(result.current.shotCount).toBe(0);

    await runOneInterval();

    expect(mockAddShotPhoto).toHaveBeenCalledTimes(1);
    expect(result.current.shotCount).toBe(1);
  });

  it("실패가 이어지면 촬영을 멈추고 알린다", async () => {
    const result = await startAutoShooting(
      createFlakyCanvas({ failBlobTimes: Number.POSITIVE_INFINITY }),
    );

    await runOneInterval();
    await runOneInterval();

    // 두 번까지는 말없이 다시 건다 — 실패는 대개 일시적이다.
    expect(result.current.isShooting).toBe(true);
    expect(mockSetNotice).not.toHaveBeenCalled();

    await runOneInterval();

    expect(result.current.isShooting).toBe(false);
    expect(result.current.countdown).toBeNull();
    expect(mockSetNotice).toHaveBeenCalledTimes(1);
  });

  it("그리기가 던져도 셔터가 죽지 않는다", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await startAutoShooting(
      createFlakyCanvas({ throwDrawTimes: 1 }),
    );

    await runOneInterval();

    expect(mockAddShotPhoto).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    // 던진 자리에서 선점이 그대로 남으면 이 셔터는 아무 일도 하지 않는다.
    await act(async () => {
      result.current.handleShootNow();
      await flushMicrotasks();
    });

    expect(mockAddShotPhoto).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
