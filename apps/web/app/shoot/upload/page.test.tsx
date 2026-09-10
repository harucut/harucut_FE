/**
 * 갤러리에서 고른 사진에 **상한이 있는지**, 그리고 그 상한을 **누가 거는지** 본다.
 *
 * 고른 파일은 한 장씩 최대 2400px JPEG data URL 로 디코딩·재인코딩된 뒤 세션과 DOM 에
 * 그대로 남는다. 앨범에서 수백 장을 고르면 다음 단계가 쓰는 것은 네 컷뿐인데 모바일
 * 웹뷰가 수백 MB 를 잡고 멈춘다. 그래서 **변환에 넘기기 전에** 자르고, 몇 장을 뺐는지
 * 말해 주어야 한다.
 *
 * 자르는 것은 화면이 아니라 `importPhotoFiles` 다. 화면이 먼저 잘랐더니 heic 가 앞에 몰린
 * 선택(28장 중 앞 24장)에서 쓸 수 있는 4장이 상한 밖으로 밀려나 결과가 0장이 됐다. 화면은
 * **고른 것을 통째로** 넘기고 남은 자리만 알려 준다 — 형식을 아는 곳이 거른 뒤에 자른다.
 *
 * 상한 숫자는 여기 박지 않는다 — 칸 수의 소유자는 `FRAME_LAYOUTS` 다. 단언은 "고른 것보다
 * 적게 받는다"와 "그래도 고를 만큼은 남긴다"라는 성질만 못 박는다.
 */
import { act, fireEvent, render, waitFor, screen } from "@testing-library/react";
import ShootUploadPage from "@/app/shoot/upload/page";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

/** 이 세션이 고른 프레임(`classic-4`)의 칸 수. 화면이 최소 장수와 상한을 뽑는 곳과 같다. */
const SLOT_COUNT = FRAME_LAYOUTS["classic-4"].slots.length;

/** 어떤 합리적인 상한도 넘길 만큼 많이 고른 경우. */
const PICKED_TOO_MANY = 300;

const mockReplace = jest.fn();
const mockAddShotPhotos = jest.fn();
const mockImportPhotoFiles = jest.fn();

const sessionState = {
  frameId: "classic-4" as string | null,
  shots: [] as string[],
  eventName: null as string | null,
  addShotPhotos: (...args: unknown[]) => mockAddShotPhotos(...args),
  removeShotPhoto: jest.fn(),
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));

jest.mock("@/lib/shootSessionStore", () => ({
  useShootSession: (selector?: (state: typeof sessionState) => unknown) =>
    selector ? selector(sessionState) : sessionState,
}));

jest.mock("@/lib/photoImport", () => ({
  importPhotoFiles: (...args: unknown[]) => mockImportPhotoFiles(...args),
}));

function photoFiles(count: number) {
  return Array.from(
    { length: count },
    (_, index) => new File(["x"], `photo-${index}.jpg`, { type: "image/jpeg" }),
  );
}

function renderPage(shots: string[] = []) {
  sessionState.shots = shots;
  const { container, unmount } = render(<ShootUploadPage />);
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("파일 입력이 없다");
  return { input, unmount };
}

beforeEach(() => {
  jest.clearAllMocks();
  // 쿠키를 읽은 회원 상태에서 시작한다 — 아래 게스트 테스트만 이것을 바꾼다.
  useGuestTrialStore.setState({
    accessMode: "member",
    hydrated: true,
    notice: null,
  });
  sessionState.frameId = "classic-4";
  sessionState.eventName = null;
  sessionState.shots = [];
  // 진짜 importPhotoFiles 처럼 상한만큼만 변환한 결과를 돌려준다.
  mockImportPhotoFiles.mockImplementation(
    async (files: File[], options?: { limit?: number }) => {
      const accepted = files.slice(0, options?.limit ?? files.length);
      return {
        dataUrls: accepted.map(
          (_, index) => `data:image/jpeg;base64,stub-${index}`,
        ),
        notice: null,
        overLimitCount: files.length - accepted.length,
      };
    },
  );
});

describe("사진 불러오기 개수 상한", () => {
  it("너무 많이 골라도 고른 것을 통째로 넘기고 상한은 인자로 준다", async () => {
    const { input } = renderPage([]);

    fireEvent.change(input, { target: { files: photoFiles(PICKED_TOO_MANY) } });

    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));
    const [handed, options] = mockImportPhotoFiles.mock.calls[0] as [
      File[],
      { limit: number },
    ];

    /*
      화면이 먼저 자르지 않는다.

      여기서 잘라 넘기면 지원하지 않는 형식이 앞에 몰린 선택에서 쓸 수 있는 사진이 상한
      밖으로 밀려난다(28장 중 앞 24장이 heic 면 0장). 거르는 순서를 아는 곳은 형식의
      주인(`lib/photoImport.ts`)뿐이라 자르기도 거기서 한다.
    */
    expect(handed).toHaveLength(PICKED_TOO_MANY);
    // 대신 상한을 함께 넘긴다 — 자르는 자리는 여전히 변환 앞이다.
    expect(options.limit).toBeLessThan(PICKED_TOO_MANY);
    // 그래도 네 컷을 고를 여지는 남긴다.
    expect(options.limit).toBeGreaterThan(SLOT_COUNT);

    const dropped = PICKED_TOO_MANY - options.limit;
    expect(
      await screen.findByText(new RegExp(`${dropped}장은 제외했어요`)),
    ).toBeInTheDocument();
    // 상한 안에 든 만큼만 담는다.
    expect(mockAddShotPhotos).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(String)]),
    );
    expect(mockAddShotPhotos.mock.calls[0][0]).toHaveLength(options.limit);
  });

  // 상한 밖으로 밀려나는 것은 **쓸 수 있는 사진** 기준이어야 한다.
  it("앞이 전부 지원하지 않는 형식이어도 뒤의 쓸 수 있는 사진이 담긴다", async () => {
    // 형식 거르기를 그대로 흉내낸다: 거른 뒤에 자른다.
    mockImportPhotoFiles.mockImplementation(
      async (files: File[], options?: { limit?: number }) => {
        const supported = files.filter((file) => file.type === "image/jpeg");
        const accepted = supported.slice(0, options?.limit ?? supported.length);
        return {
          dataUrls: accepted.map(
            (_, index) => `data:image/jpeg;base64,stub-${index}`,
          ),
          notice: `${files.length - supported.length}장은 지원하지 않는 형식이라 제외했어요.`,
          overLimitCount: supported.length - accepted.length,
        };
      },
    );
    const { input } = renderPage([]);

    // 상한(칸 수의 여섯 배)을 채울 만큼의 heic 뒤에 쓸 수 있는 네 장.
    const files = [
      ...Array.from(
        { length: SLOT_COUNT * 6 },
        (_, index) => new File(["x"], `p-${index}.heic`, { type: "image/heic" }),
      ),
      ...photoFiles(SLOT_COUNT),
    ];
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(mockAddShotPhotos).toHaveBeenCalledTimes(1));
    // 화면이 먼저 잘랐다면 넘어간 것이 heic 뿐이라 여기가 0장이 된다.
    expect(mockAddShotPhotos.mock.calls[0][0]).toHaveLength(SLOT_COUNT);
  });

  it("이미 담아 둔 것까지 세어, 꽉 찼으면 변환을 아예 시작하지 않는다", async () => {
    // 한 번 고른 상한만큼 이미 들고 있는 상태를 만든다.
    const { input } = renderPage([]);
    fireEvent.change(input, { target: { files: photoFiles(PICKED_TOO_MANY) } });
    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));
    const cap = (mockImportPhotoFiles.mock.calls[0][1] as { limit: number })
      .limit;

    jest.clearAllMocks();
    const full = renderPage(
      Array.from({ length: cap }, (_, index) => `data:image/jpeg;base64,${index}`),
    );

    fireEvent.change(full.input, { target: { files: photoFiles(3) } });

    expect(
      await screen.findByText(new RegExp("3장은 제외했어요")),
    ).toBeInTheDocument();
    // 디코딩·재인코딩이 한 장도 돌지 않는다.
    expect(mockImportPhotoFiles).not.toHaveBeenCalled();
    expect(mockAddShotPhotos).not.toHaveBeenCalled();
  });

  // 상한은 평범한 사용을 건드리면 안 된다.
  it("네 컷을 채울 만큼만 고르면 한 장도 빠지지 않는다", async () => {
    const { input } = renderPage([]);

    fireEvent.change(input, { target: { files: photoFiles(SLOT_COUNT) } });

    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));
    expect(mockImportPhotoFiles.mock.calls[0][0]).toHaveLength(SLOT_COUNT);
    expect(mockAddShotPhotos).toHaveBeenCalledTimes(1);
    expect(mockAddShotPhotos.mock.calls[0][0]).toHaveLength(SLOT_COUNT);
    expect(screen.queryByText(/제외했어요/)).not.toBeInTheDocument();
  });

  // 남은 자리는 이미 담아 둔 것을 뺀 만큼이다.
  it("이미 담아 둔 것이 있으면 남은 자리만 상한으로 넘긴다", async () => {
    const { input } = renderPage([]);
    fireEvent.change(input, { target: { files: photoFiles(PICKED_TOO_MANY) } });
    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));
    const cap = (mockImportPhotoFiles.mock.calls[0][1] as { limit: number })
      .limit;

    jest.clearAllMocks();
    const held = renderPage(
      Array.from({ length: cap - 2 }, (_, index) => `data:image/jpeg;base64,${index}`),
    );

    fireEvent.change(held.input, { target: { files: photoFiles(10) } });

    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));
    expect(mockImportPhotoFiles.mock.calls[0][1]).toEqual({ limit: 2 });
    expect(
      await screen.findByText(new RegExp("8장은 제외했어요")),
    ).toBeInTheDocument();
  });

  /*
    변환이 끝나기 전에 화면을 떠난 경우.

    `addShotPhotos` 가 건드리는 것은 이 화면의 상태가 아니라 **전역 촬영 세션**이라,
    언마운트만으로는 아무것도 막히지 않는다. `/shoot` 의 초기화가 먼저 끝난 뒤 늦게 온
    결과가 담기면 지난 선택이 새 세션에 되살아난다.
  */
  it("변환 중 화면을 떠나면 늦게 끝난 결과를 세션에 담지 않는다", async () => {
    let finishImport!: (result: {
      dataUrls: string[];
      notice: string | null;
      overLimitCount: number;
    }) => void;
    mockImportPhotoFiles.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishImport = resolve;
        }),
    );
    const { input, unmount } = renderPage([]);

    fireEvent.change(input, { target: { files: photoFiles(SLOT_COUNT) } });
    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));

    // 하드웨어 뒤로가기로 화면을 떠난다. 변환은 그대로 진행된다.
    unmount();

    await act(async () => {
      finishImport({
        dataUrls: Array.from(
          { length: SLOT_COUNT },
          (_, index) => `data:image/jpeg;base64,late-${index}`,
        ),
        notice: null,
        overLimitCount: 0,
      });
    });

    expect(mockAddShotPhotos).not.toHaveBeenCalled();
  });

  // 형식 때문에 걸러진 안내와 상한 안내가 서로를 지우면 안 된다.
  it("상한 안내와 변환 단계 안내를 함께 보여 준다", async () => {
    mockImportPhotoFiles.mockResolvedValue({
      dataUrls: ["data:image/jpeg;base64,stub"],
      notice: "2장은 읽지 못해 제외했어요.",
      overLimitCount: 1,
    });
    const { input } = renderPage([]);

    fireEvent.change(input, { target: { files: photoFiles(PICKED_TOO_MANY) } });

    expect(
      await screen.findByText(/최대 \d+장까지 담을 수 있어/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2장은 읽지 못해 제외했어요/),
    ).toBeInTheDocument();
  });
});

/*
  ── 갤러리 불러오기는 회원만 쓴다 ──

  한동안 이 판정의 유일한 집행 지점이 프록시였다(`GUEST_MEMBER_ONLY_PREFIXES`). 그런데
  프록시는 **요청이 올 때** 한 번 보고, 그 판정의 근거인 게스트 쿠키는 나중에 심길 수 있다 —
  행사 진입이 그렇다(app/shoot/page.tsx 가 인증 왕복 뒤에 판정한다). 그 사이에
  `/shoot?source=upload&event=...` 에서 확인을 누르면 이 화면이 먼저 열리고, 뒤늦게
  게스트가 되어도 이미 들어와 있어 아무도 되돌리지 않았다.

  비회원 범위는 약관 제8조와 `@harucut/shared` 의 `GUEST_ALLOWED_ITEMS` 가 "사진 촬영과
  이미지 저장"으로 못박는다 — 갤러리 불러오기는 거기 없다.
*/
describe("게스트는 갤러리 불러오기에 머무르지 못한다", () => {
  it("게스트로 확인되면 촬영 화면으로 되돌린다", () => {
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });

    render(<ShootUploadPage />);

    expect(mockReplace).toHaveBeenCalledWith(
      "/shoot?guestNotice=restricted&frame=classic-4",
    );
  });

  /*
    회귀 — **되돌릴 때 행사 이름과 고른 프레임을 잃지 않는다.**

    `/shoot` 은 쿼리도 `keepShots` 도 없는 진입을 새 촬영으로 보고 세션을 비운다. 고정 주소로
    보내면 행사 배너와 QR 이 지정한 프레임이 함께 사라져, 참가자가 기본 프레임으로 찍게 된다.
    막는 것은 회원 전용 경로 하나지 행사 진입 전체가 아니다.
  */
  it("되돌릴 때 행사 이름과 프레임을 들려 보낸다", () => {
    sessionState.eventName = "hongdae-2026";
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });

    render(<ShootUploadPage />);

    expect(mockReplace).toHaveBeenCalledWith(
      "/shoot?guestNotice=restricted&frame=classic-4&event=hongdae-2026",
    );
  });

  /*
    이 화면이 열린 **뒤에** 게스트가 되는 경우가 이번에 잡힌 자리다 — 행사 진입의 판정이
    인증 왕복 뒤에 끝난다. 마운트 시점만 보면 그 순간을 놓친다.
  */
  it("들어온 뒤에 게스트가 되어도 되돌린다", () => {
    render(<ShootUploadPage />);
    expect(mockReplace).not.toHaveBeenCalled();

    act(() => {
      useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/shoot?guestNotice=restricted&frame=classic-4",
    );
  });

  /*
    반대쪽 못 둘. 회원은 그대로 쓰고, **쿠키를 읽기 전에는 움직이지 않는다** —
    `accessMode` 의 초깃값이 "member" 라 `hydrated` 를 안 보면 진짜 회원이 한 프레임
    동안 튕긴다. 이 못이 없으면 "무조건 되돌린다"로 고쳐도 위 둘이 통과한다.
  */
  it("회원은 그대로 머무른다", () => {
    render(<ShootUploadPage />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("쿠키를 읽기 전에는 되돌리지 않는다", () => {
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: false });

    render(<ShootUploadPage />);

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
