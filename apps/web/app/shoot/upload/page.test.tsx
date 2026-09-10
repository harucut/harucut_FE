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
import { GUEST_TRIAL_COOKIE } from "@/lib/guestTrialShared";
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

const mockResolveMembership = jest.fn();

// 회원 여부 판정만 갈아 끼운다 — 스토어와 쿠키는 실제 구현을 그대로 태운다.
jest.mock("@/lib/authSession", () => ({
  resolveMembership: (...args: unknown[]) => mockResolveMembership(...args),
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

/*
  이 화면은 **회원으로 확인된 뒤에** 조작이 열린다(page.tsx 의 `memberOnlyLocked`).
  그래서 렌더만 하고 파일을 넣으면 입력이 아직 `disabled` 라 아무 일도 일어나지 않는다.
  여기서 그 확인을 기다린다 — 각 테스트가 매번 같은 대기를 적지 않도록.
*/
async function renderPage(shots: string[] = []) {
  sessionState.shots = shots;
  const { container, unmount } = render(<ShootUploadPage />);
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("파일 입력이 없다");
  await waitFor(() => {
    expect(input).not.toBeDisabled();
  });
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
  // 평범한 경우는 회원이다. 게스트 갈래는 아래 describe 가 따로 세운다.
  mockResolveMembership.mockResolvedValue("member");
  document.cookie = `${GUEST_TRIAL_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
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
    const { input } = await renderPage([]);

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
    const { input } = await renderPage([]);

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
    const { input } = await renderPage([]);
    fireEvent.change(input, { target: { files: photoFiles(PICKED_TOO_MANY) } });
    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));
    const cap = (mockImportPhotoFiles.mock.calls[0][1] as { limit: number })
      .limit;

    jest.clearAllMocks();
    const full = await renderPage(
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
    const { input } = await renderPage([]);

    fireEvent.change(input, { target: { files: photoFiles(SLOT_COUNT) } });

    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));
    expect(mockImportPhotoFiles.mock.calls[0][0]).toHaveLength(SLOT_COUNT);
    expect(mockAddShotPhotos).toHaveBeenCalledTimes(1);
    expect(mockAddShotPhotos.mock.calls[0][0]).toHaveLength(SLOT_COUNT);
    expect(screen.queryByText(/제외했어요/)).not.toBeInTheDocument();
  });

  // 남은 자리는 이미 담아 둔 것을 뺀 만큼이다.
  it("이미 담아 둔 것이 있으면 남은 자리만 상한으로 넘긴다", async () => {
    const { input } = await renderPage([]);
    fireEvent.change(input, { target: { files: photoFiles(PICKED_TOO_MANY) } });
    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));
    const cap = (mockImportPhotoFiles.mock.calls[0][1] as { limit: number })
      .limit;

    jest.clearAllMocks();
    const held = await renderPage(
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
    const { input, unmount } = await renderPage([]);

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
    const { input } = await renderPage([]);

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
  it("게스트로 확인되면 촬영 화면으로 되돌린다", async () => {
    mockResolveMembership.mockResolvedValue("guest");
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });

    render(<ShootUploadPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/shoot?guestNotice=restricted&frame=classic-4",
      );
    });
  });

  /*
    회귀 — **되돌릴 때 행사 이름과 고른 프레임을 잃지 않는다.**

    `/shoot` 은 쿼리도 `keepShots` 도 없는 진입을 새 촬영으로 보고 세션을 비운다. 고정 주소로
    보내면 행사 배너와 QR 이 지정한 프레임이 함께 사라져, 참가자가 기본 프레임으로 찍게 된다.
    막는 것은 회원 전용 경로 하나지 행사 진입 전체가 아니다.
  */
  it("되돌릴 때 행사 이름과 프레임을 들려 보낸다", async () => {
    mockResolveMembership.mockResolvedValue("guest");
    sessionState.eventName = "hongdae-2026";
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });

    render(<ShootUploadPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/shoot?guestNotice=restricted&frame=classic-4&event=hongdae-2026",
      );
    });
  });

  /*
    이 화면이 열린 **뒤에** 게스트가 되는 경우가 이번에 잡힌 자리다 — 행사 진입의 판정이
    인증 왕복 뒤에 끝난다. 마운트 시점만 보면 그 순간을 놓친다.
  */
  it("들어온 뒤에 게스트가 되어도 되돌린다", async () => {
    render(<ShootUploadPage />);
    expect(mockReplace).not.toHaveBeenCalled();

    mockResolveMembership.mockResolvedValue("guest");
    act(() => {
      useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/shoot?guestNotice=restricted&frame=classic-4",
      );
    });
  });

  /*
    회귀 — **낡은 게스트 쿠키를 든 회원은 내보내지 않는다.**

    이 판정이 붙기 전 배포에서 체험을 한 번 눌러 본 사람에게는 게스트 쿠키가 남아 있는데
    세션은 멀쩡하다. 프록시는 그 사람을 살아 있는 access 로 통과시키는데, 여기서 쿠키만
    보고 되돌리면 쿠키가 만료(7일)되거나 다시 로그인하기 전까지 회원 전용 기능을 잃는다.
    쿠키는 그 자리에서 걷는다.
  */
  it("낡은 쿠키를 든 회원은 쿠키만 걷고 머무른다", async () => {
    mockResolveMembership.mockResolvedValue("member");
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });

    render(<ShootUploadPage />);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().accessMode).toBe("member");
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  /*
    못 물어봤으면 내보내지는 않는다 — 서버가 잠깐 흔들렸다고 회원을 쫓아내지 않는다.
    **다만 쓰게 두지도 않는다.** 그것만 두면 이미 게스트인 사람이 그 틈에 갤러리
    불러오기를 끝까지 쓴다(그 뒤 결과 화면은 같은 `accessMode` 를 보고 브라우저에서
    합성한다). 내보내는 것은 확정된 게스트뿐이고, 쓰게 두는 것은 회원으로 확인된 뒤다.
  */
  it("판정할 수 없으면 내보내지도, 쓰게 두지도 않는다", async () => {
    mockResolveMembership.mockResolvedValue("unknown");
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });

    render(<ShootUploadPage />);

    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().accessMode).toBe("guest");
    expect(screen.getByRole("button", { name: "사진 고르기" })).toBeDisabled();
  });

  /*
    회귀 — **잠긴 이유를 말하고 다시 해 볼 길을 준다.**

    `unknown` 에서 잠그기만 하면, 서버가 잠깐 흔들린 것만으로 멀쩡한 회원이 화면을 새로
    열기 전까지 아무것도 못 한다 — 안내조차 없이. effect 의 의존성도 안 바뀌므로 저절로
    다시 묻지도 않는다.
  */
  it("판정하지 못하면 이유를 말하고 다시 확인할 수 있다", async () => {
    mockResolveMembership.mockResolvedValue("unknown");

    render(<ShootUploadPage />);

    const retry = await screen.findByRole("button", { name: "다시 확인" });
    expect(screen.getByText(/회원인지 확인하지 못했어요/)).toBeInTheDocument();

    // 서버가 돌아왔다. 다시 확인하면 잠금이 풀린다.
    mockResolveMembership.mockResolvedValue("member");
    fireEvent.click(retry);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "사진 고르기" }),
      ).not.toBeDisabled();
    });
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
  });

  // 반대쪽 못 — 회원으로 확인된 평범한 경우에는 그 안내가 뜨지 않는다.
  it("회원으로 확인되면 안내가 뜨지 않는다", async () => {
    render(<ShootUploadPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "사진 고르기" }),
      ).not.toBeDisabled();
    });
    expect(screen.queryByText(/회원인지 확인하지 못했어요/)).toBeNull();
  });

  /*
    회귀 — **되돌리면 진행 중이던 변환도 버린다.**

    잠그기 전에 시작된 변환이 되돌리는 사이에 끝나면 그 사진이 **전역 촬영 세션**에 담긴다.
    고르기·결과는 게스트 허용 경로라, 그 뒤로는 아무도 막지 않고 합성까지 간다 —
    화면을 내보내는 것만으로는 안 막히는 자리다.
  */
  it("게스트로 되돌릴 때 진행 중이던 변환 결과는 담지 않는다", async () => {
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

    // 회원으로 확인돼 잠금이 풀린 상태에서 변환을 시작한다.
    const { input } = await renderPage([]);
    fireEvent.change(input, { target: { files: photoFiles(SLOT_COUNT) } });
    await waitFor(() => expect(mockImportPhotoFiles).toHaveBeenCalledTimes(1));

    // 그 사이 게스트로 뒤집힌다(행사 화면의 늦은 판정).
    mockResolveMembership.mockResolvedValue("guest");
    act(() => {
      useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

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

    // 고치기 전에는 여기서 세션에 담겨, 고르기·결과가 그대로 이어졌다.
    expect(mockAddShotPhotos).not.toHaveBeenCalled();
  });

  /*
    회귀 — **확정된 비회원은 실제로 게스트가 된다.**

    행사 쿼리 없이 이 화면을 연 사람의 쿠키가 만료·회수됐으면, 되돌리기만 해서는 `accessMode`
    가 `member` 로 남는다. 프록시는 남은 죽은 쿠키로 계속 통과시키고, 화면은 회원처럼
    그리다가 결과 단계의 인증 API 에서 막힌다 — 벗어날 손잡이가 없는 막다른 길이다.
  */
  it("게스트로 확인되면 체험 상태로 바꾸고 되돌린다", async () => {
    mockResolveMembership.mockResolvedValue("guest");

    render(<ShootUploadPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalled();
    });
    expect(useGuestTrialStore.getState().accessMode).toBe("guest");
    expect(document.cookie).toContain(`${GUEST_TRIAL_COOKIE}=1`);
  });

  /*
    회귀 — **떠난 뒤에는 이동을 접는다.**

    판정을 기다리는 사이 뒤로가기나 헤더 링크로 떠날 수 있다. 그때 늦게 온 `guest` 로
    이동을 돌리면 사용자가 옮겨 간 화면을 촬영 화면으로 덮어쓴다. 회원 전용 조작은
    판정 전까지 잠겨 있으니 떠난 뒤에까지 이동을 끌고 갈 이유가 없다.

    반대로 쿠키 전환은 전역이라 접지 않는다 — 접으면 다음 화면이 거짓 상태로 돌아간다.
  */
  it("판정 중에 떠나면 늦은 이동은 하지 않는다", async () => {
    let answer!: (value: string) => void;
    mockResolveMembership.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    const { unmount } = render(<ShootUploadPage />);
    unmount();

    await act(async () => {
      answer("guest");
    });

    expect(mockReplace).not.toHaveBeenCalled();
    // 전역 상태는 사실에 맞춰 둔다.
    expect(useGuestTrialStore.getState().accessMode).toBe("guest");
  });

  // 반대쪽 못 — 회원으로 확인되면 잠금이 풀린다. 없으면 「늘 잠근다」로 고쳐도 통과한다.
  it("회원으로 확인되면 잠금이 풀린다", async () => {
    mockResolveMembership.mockResolvedValue("member");
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });

    render(<ShootUploadPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "사진 고르기" }),
      ).not.toBeDisabled();
    });
  });

  /*
    반대쪽 못 둘. 회원은 그대로 쓰고, **쿠키를 읽기 전에는 움직이지 않는다** —
    `accessMode` 의 초깃값이 "member" 라 `hydrated` 를 안 보면 진짜 회원이 한 프레임
    동안 튕긴다. 이 못이 없으면 "무조건 되돌린다"로 고쳐도 위 둘이 통과한다.
  */
  /*
    회원도 **묻는다.** 기준을 쿠키가 아니라 서버의 답으로 두었기 때문이다 — `accessMode` 의
    초깃값이 "member" 라 쿠키로 잠그면 잠금이 처음부터 풀려 있고, 행사 진입에서 앞 화면의
    판정을 기다리는 사람이 그 틈에 사진을 담아 다음 화면으로 넘어갈 수 있다.
    값은 왕복 하나다(재발급은 clientApi 가 하나로 묶는다).
  */
  it("회원으로 확인되면 머무르고 조작이 열린다", async () => {
    render(<ShootUploadPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "사진 고르기" }),
      ).not.toBeDisabled();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  /*
    회귀 — **확인되기 전에는 잠겨 있다.** 이 못이 없으면 「처음부터 열어 둔다」로 고쳐도
    나머지가 통과한다. 행사 진입의 죽은 쿠키 사용자가 그 틈을 쓰던 자리다.
  */
  it("확인되기 전에는 잠겨 있다", () => {
    // 답을 붙잡아 둔다 — 판정이 아직 안 끝난 순간이다.
    mockResolveMembership.mockImplementation(() => new Promise(() => {}));
    // 다음 단계 버튼은 사진이 모자라도 비활성이라, 잠금만 재려면 채워 둬야 한다.
    sessionState.shots = ["data:1", "data:2", "data:3", "data:4"];

    render(<ShootUploadPage />);

    expect(screen.getByRole("button", { name: "사진 고르기" })).toBeDisabled();
    // 사진이 없으면 라벨이 안내 문구다 — 잠금과는 별개로 이미 비활성이라, 잠금만
    // 재려면 사진을 담아 둔 상태로 봐야 한다(아래 테스트).
    expect(screen.getByRole("button", { name: "다음 단계로" })).toBeDisabled();
  });

  it("쿠키를 읽기 전에는 묻지도 되돌리지도 않는다", async () => {
    useGuestTrialStore.setState({ accessMode: "member", hydrated: false });

    render(<ShootUploadPage />);

    await act(async () => {});
    expect(mockResolveMembership).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
