/**
 * 기록 화면이 실패를 어떻게 말하는가.
 *
 * 다운로드·공유·삭제 실패는 `alert()` 였다. 브라우저 모달은 이 디자인의 것이 아닌 데다
 * 확인을 누르기 전까지 방금 바뀐 화면을 가려서, 마이페이지가 같은 이유로 걷어냈다
 * (app/mypage/page.tsx). 지금은 화면 맨 위 배너가 성공과 실패를 함께 맡는다.
 *
 * 못 박는 것은 두 가지다.
 *  - alert 를 걷어내면서 **실패까지 같이 걷어내지 않았는가.** 실패는 화면 안 문구로 남아야
 *    하고, 삭제 확인 창은 닫혀서 그 문구를 가리지 않아야 한다.
 *  - 목록이 길어도 그 자리에 붙어 있는가. 배너는 목록보다 위에 있어서, 아래쪽 카드에서
 *    누른 결과가 화면 밖에 그려지곤 했다.
 *  - 실패가 성공처럼 2.4초 만에 지워지지는 않는가. 성공은 결과가 화면에 이미 보이지만,
 *    실패는 읽을 시간이 필요하고 대개 다시 시도해야 한다.
 *  - 공유 실패를 한 문구로 묶지는 않는가. 링크를 못 만든 것과 만들어 놓고 복사만 막힌 것은
 *    사용자가 할 일이 다르다(lib/share.ts 의 CopyFailedError).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import HistoryPage from "@/app/history/page";
// 목이 아니라 진짜다 — 아래 jest.mock 이 requireActual 로 펼쳐 둔 것을 가져온다.
import { CopyFailedError } from "@/lib/share";

const mockListMyMedia = jest.fn();
const mockGetMyUserInfo = jest.fn();
const mockDeleteMedia = jest.fn();
const mockGetMediaDownloadUrl = jest.fn();
const mockGetImageUrlByKey = jest.fn();
const mockShareOrCopyLink = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/history",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/lib/userMediaApi", () => ({
  listMyMedia: (...args: unknown[]) => mockListMyMedia(...args),
  deleteMedia: (...args: unknown[]) => mockDeleteMedia(...args),
  getMediaDownloadUrl: (...args: unknown[]) => mockGetMediaDownloadUrl(...args),
  updateMediaDisplayName: jest.fn(),
}));

jest.mock("@/lib/userApi", () => ({
  getMyUserInfo: () => mockGetMyUserInfo(),
}));

jest.mock("@/lib/presignedUploadApi", () => ({
  getImageUrlByKey: (...args: unknown[]) => mockGetImageUrlByKey(...args),
}));

// 공유 동작만 목으로 갈아 끼우고 실패 판정(isCopyFailedError)은 진짜를 쓴다 — 판정까지
// 목으로 덮으면 이 파일이 자기 목만 확인하게 된다.
jest.mock("@/lib/share", () => ({
  ...jest.requireActual("@/lib/share"),
  shareOrCopyLink: (...args: unknown[]) => mockShareOrCopyLink(...args),
}));

// 화면 껍데기는 이 테스트가 보는 것과 무관하고, 각자 라우팅·세션을 따로 건드린다.
jest.mock("@/components/layout/AppNav", () => ({ AppNav: () => null }));
jest.mock("@/components/layout/MobileTabBar", () => ({
  MobileTabBar: () => null,
}));

const ITEM = {
  mediaId: 7,
  s3Key: "media/7.png",
  displayName: "바다에서",
  createdAt: "2026-08-14T18:00:00",
};
/**
 * 목록 카드 버튼의 이름 — 카드 글자(이름 + 날짜)가 그대로 이름이다.
 * 날짜가 15일인 것은 오프셋 없는 값을 UTC 로 읽고(userMediaApi 의 KST 정규화는 여기서 목으로
 * 빠진다) 테스트가 서울 시간대에서 돌기 때문이다(jest.config.mjs) — 8월 15일 03시.
 */
const CARD = "바다에서 08.15";
/** 지우기 확인 창의 이름(ConfirmDialog 의 제목). 보기 화면도 dialog 라 이름으로 가른다. */
const CONFIRM_TITLE = "이 사진을 지울까요?";

/** 배너 자동 소멸 시간(page.tsx)보다 넉넉히 넘긴다. */
const PAST_AUTO_DISMISS_MS = 4000;

/** 삭제 종료 상한(lib/userMediaApi.ts 의 DELETE_DEADLINE_MS = 30초)보다 넉넉히 넘긴다. */
const PAST_DELETE_DEADLINE_MS = 31_000;
/*
  상한에 **닿기 직전**. 제품 상한(lib/userMediaApi.ts 의 DELETE_DEADLINE_MS = 30초)보다
  조금 작은 값이라, 상한을 줄이는 회귀가 나면 이 자리에서 먼저 끊긴다. 두 숫자가 갈라지면
  이 파일이 아니라 그쪽을 고친 사람이 여기도 봐야 한다 — 그래서 값이 아니라 관계를 적어 둔다.
*/
const JUST_BEFORE_DELETE_DEADLINE_MS = 29_000;

/** 멈춘 삭제가 상한에 걸렸을 때의 문구(page.tsx). */
const DELETE_STALLED_TEXT =
  "응답이 없어 삭제 결과를 확인하지 못했어요. 잠시 후 목록을 새로고침해 확인해 주세요.";

/**
 * 목이 아니라 **진짜** `deleteMedia`. 상한은 그 안에 있으니, 목으로 덮으면 이 파일이
 * 자기 목에 심은 타이머만 확인하게 된다. 전송은 `global.fetch` 를 갈아 끼워 흉내 낸다.
 */
const { deleteMedia: realDeleteMedia } = jest.requireActual<
  typeof import("@/lib/userMediaApi")
>("@/lib/userMediaApi");

/**
 * 응답도 실패도 오지 않는 fetch. 회선이 응답 없이 멈춘 상태다 — 끊길 때만 브라우저처럼
 * AbortError 로 깨진다(clientApi 의 isAbortError 가 name 으로 보는 그 오류).
 */
function stalledFetch() {
  return jest.fn(
    (_input: unknown, init?: { signal?: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
  ) as unknown as typeof fetch;
}

/**
 * 곧바로 빈 204 를 주는 fetch. `Response` 전부가 필요하지 않다 — clientApi 가 읽는
 * 네 가지(status·ok·text·headers)만 흉내 낸다.
 */
function okFetch() {
  return jest.fn(async () => ({
    ok: true,
    status: 204,
    headers: undefined,
    text: async () => "",
  })) as unknown as typeof fetch;
}

/** 목록이 그려질 때까지 기다린다. 조회는 타이머가 아니라 프라미스로 끝난다. */
async function renderHistory() {
  render(<HistoryPage />);
  await act(async () => {});
  return screen.getByRole("button", { name: CARD });
}

/** 카드를 눌러 크게 본다. 저장·공유·지우기는 이 화면에만 있다. */
async function openViewer() {
  fireEvent.click(await renderHistory());
  return screen.getByRole("dialog", { name: "바다에서" });
}

/** 보기 화면 → ⋯ → 지우기 → 확인 창이 뜬 데까지. */
async function askDelete() {
  const viewer = await openViewer();
  fireEvent.click(within(viewer).getByRole("button", { name: "더보기" }));
  fireEvent.click(within(viewer).getByRole("button", { name: "지우기" }));
  return screen.getByRole("dialog", { name: CONFIRM_TITLE });
}

/**
 * 기록이 하나도 없는 상태로 그린다 — 보관 기간 안내는 이 자리에서만 나온다.
 *
 * 등급 조회는 목록 조회가 끝난 뒤에 이어서 돈다. 프라미스를 한 번만 흘려보내면 등급이
 * 아직 null 이라 어떤 등급을 넣어도 안내가 안 뜬 것처럼 보인다.
 */
async function renderEmptyHistory() {
  mockListMyMedia.mockResolvedValue([]);
  render(<HistoryPage />);
  await act(async () => {});
  await act(async () => {});
  return screen.getByText("저장한 기록이 아직 없어요.");
}

/** 확인 창의 "지우기" 까지. */
async function confirmDelete() {
  const confirm = await askDelete();

  await act(async () => {
    fireEvent.click(within(confirm).getByRole("button", { name: "지우기" }));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // 크게 보는 사진은 주소(?photo=)에 남는다. 앞 테스트의 주소로 시작하지 않게 되돌린다.
  window.history.replaceState(null, "", "/history");
  mockListMyMedia.mockResolvedValue([ITEM]);
  mockGetMyUserInfo.mockResolvedValue({ planTier: "BASIC" });
  mockGetImageUrlByKey.mockResolvedValue("https://cdn.example.com/media/7.png");
  mockGetMediaDownloadUrl.mockResolvedValue(
    "https://cdn.example.com/media/7.png?download=1",
  );
  mockShareOrCopyLink.mockResolvedValue("copied");
  // 실패 경로는 console.error 로 원인을 남긴다. 테스트 출력까지 더럽힐 이유는 없다.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("기록 화면의 실패 알림", () => {
  it("삭제에 실패하면 확인 창을 닫고 사유를 보던 사진 화면에 남긴다", async () => {
    mockDeleteMedia.mockRejectedValue(new Error("boom"));

    await confirmDelete();

    // 확인 창이 남아 있으면 문구를 가린다.
    expect(
      screen.queryByRole("dialog", { name: CONFIRM_TITLE }),
    ).not.toBeInTheDocument();
    // 목록 위 띠는 보기 화면에 가려 보이지 않는다 — 사유는 보기 화면 안에서 말한다.
    const viewer = screen.getByRole("dialog", { name: "바다에서" });
    expect(within(viewer).getByText("사진을 지우지 못했어요.")).toBeInTheDocument();
    // 지우지 못했으니 목록에도 그대로 있어야 한다.
    expect(screen.getByRole("button", { name: CARD })).toBeInTheDocument();
  });

  it("실패 문구는 시간이 지나도 지워지지 않는다", async () => {
    mockDeleteMedia.mockRejectedValue(new Error("boom"));

    await confirmDelete();

    await act(async () => {
      jest.advanceTimersByTime(PAST_AUTO_DISMISS_MS);
    });

    expect(screen.getByText("사진을 지우지 못했어요.")).toBeInTheDocument();
  });

  /*
    jsdom 은 배치를 계산하지 않으니 "뷰포트 안인가"는 여기서 못 본다. 걸 수 있는 최대치는
    배너를 감싼 띠가 붙어 있는 상자인가 하나다 — 그 클래스가 사라지면 결과가 다시 화면
    밖으로 나간다(390×844 실측으로 맨 아래 카드 삭제 실패 시 배너 top 이 -3,917px 이었다).
    지금 목록 위 띠에 오는 결과는 지운 뒤의 것이다 — 지운 사진의 보기 화면은 닫힌다.
  */
  it("지우면 보기 화면을 닫고 결과를 목록 위 띠에 붙여 말한다", async () => {
    mockDeleteMedia.mockResolvedValue(undefined);
    await confirmDelete();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const banner = screen.getByText("사진을 지웠어요.");
    expect(banner.parentElement).toHaveClass("sticky");
  });

  /*
    ── 회귀: 응답 없이 멈춘 삭제에서 빠져나올 수 있는가 ──

    확인 창은 실행 중에는 취소·배경·Escape 를 전부 막는다 — 되돌릴 수 없는 DELETE 가 도는
    사이 닫히면 결과와 실패 사유를 볼 자리가 사라져서다(components/ui/ConfirmDialog.tsx).
    그 가드는 `running` 이 **언젠가 내려온다**는 것을 전제로 한다.

    예전에는 `deleteMedia` 에 종료 상한이 없었다. fetch 는 스스로 끝나지 않으니 회선이
    응답 없이 멈추면(모바일에서 흔하다) 프라미스가 영영 안 끝나고 `running` 도 안 내려온다.
    가드가 영구화되면서 포커스는 아무 동작도 하지 않는 취소 버튼에 갇히고, 사용자는
    새로고침 전까지 앱을 쓸 수 없었다.

    여기서는 목이 아니라 진짜 `deleteMedia` 를 태운다 — 상한은 그 안에 있다.
  */
  describe("응답 없이 멈춘 삭제", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("상한이 지나면 확인 창이 닫히고 결과를 모른다고 말한다", async () => {
      global.fetch = stalledFetch();
      mockDeleteMedia.mockImplementation(realDeleteMedia);

      await confirmDelete();

      // 상한 전에는 그대로 막혀 있어야 한다 — 여기까지는 예전 판단 그대로다.
      expect(screen.getByRole("dialog", { name: CONFIRM_TITLE })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByRole("dialog", { name: CONFIRM_TITLE })).toBeInTheDocument();
      // Escape 는 맨 위 창(확인 창) 것이다. 아래 깔린 보기 화면이 대신 닫히지도 않는다.
      expect(screen.getByRole("dialog", { name: "바다에서" })).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(PAST_DELETE_DEADLINE_MS);
      });
      await act(async () => {});

      expect(
        screen.queryByRole("dialog", { name: CONFIRM_TITLE }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(DELETE_STALLED_TEXT)).toBeInTheDocument();

      /*
        문구가 "지우지 못했어요"가 아닌 이유, 목록에서 빼지 않는 이유는 같다 —
        끊긴 쪽에서는 요청이 서버까지 갔는지 알 수 없다. 지워졌는데 남아 있다고 하거나
        안 지워졌는데 지웠다고 하거나, 어느 쪽이든 화면이 거짓말을 하게 된다.
      */
      expect(screen.getByRole("button", { name: CARD })).toBeInTheDocument();
    });

    /*
      반대쪽 못. 상한을 너무 짧게 잡거나 아예 "삭제는 늘 실패로 끝낸다"로 바꿔도 위
      케이스는 통과한다. 제때 답이 오는 평범한 삭제는 상한에 걸리지 않아야 한다.
    */
    it("제때 끝나는 삭제는 상한에 걸리지 않는다", async () => {
      global.fetch = okFetch();
      mockDeleteMedia.mockImplementation(realDeleteMedia);

      await confirmDelete();

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText("사진을 지웠어요.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: CARD })).not.toBeInTheDocument();

      // 이미 끝난 요청의 상한이 뒤늦게 깨어나 실패 문구를 덮어쓰지 않는다.
      await act(async () => {
        jest.advanceTimersByTime(PAST_DELETE_DEADLINE_MS);
      });
      expect(screen.queryByText(DELETE_STALLED_TEXT)).not.toBeInTheDocument();
    });

    /*
      반대쪽 못의 **아래쪽**. 위 두 케이스만으로는 상한을 30ms 로 줄여도 전부 통과한다 —
      즉 "상한이 있다"만 잠그고 "너무 짧지 않다"는 못 잠근다. 상한을 넘기 직전에 답이
      오는 삭제는 그대로 성공해야 한다.
    */
    it("상한 직전에 답이 오면 성공으로 끝난다", async () => {
      let respond = () => {};
      // 상한이 실제로 끊는지 보려면 **signal 을 지키는** fetch 여야 한다. 위 stalledFetch 와
      // 같은 규약을 쓰되, 여기서는 우리가 원할 때 답이 오게 둔다.
      global.fetch = jest.fn(
        (_input: unknown, init?: { signal?: AbortSignal }) =>
          new Promise((resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            });
            respond = () =>
              resolve({
                ok: true,
                status: 204,
                headers: undefined,
                text: async () => "",
              } as unknown as Response);
          }),
      ) as unknown as typeof fetch;
      mockDeleteMedia.mockImplementation(realDeleteMedia);

      const confirm = await askDelete();
      fireEvent.click(within(confirm).getByRole("button", { name: "지우기" }));

      // 상한에 닿기 직전까지 기다린다. 여기서 끊기면 상한이 너무 짧은 것이다.
      await act(async () => {
        jest.advanceTimersByTime(JUST_BEFORE_DELETE_DEADLINE_MS);
      });
      expect(screen.queryByText(DELETE_STALLED_TEXT)).not.toBeInTheDocument();

      await act(async () => {
        respond();
      });
      await waitFor(() => {
        expect(screen.getByText("사진을 지웠어요.")).toBeInTheDocument();
      });
    });
  });

  it("성공 문구는 잠깐 떴다 사라진다", async () => {
    mockDeleteMedia.mockResolvedValue(undefined);

    await confirmDelete();
    expect(screen.getByText("사진을 지웠어요.")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(PAST_AUTO_DISMISS_MS);
    });

    expect(screen.queryByText("사진을 지웠어요.")).not.toBeInTheDocument();
  });
});

/*
  공유가 실패했을 때 무엇을 말하는가.

  갈래는 둘이고, 사용자가 할 일이 다르다. 링크를 못 만든 것은 잠시 뒤 다시 누르면 되지만,
  링크는 만들어 놓고 브라우저가 복사를 막은 것은(lib/share.ts 의 CopyFailedError) 복사를 허용하기
  전에는 몇 번을 눌러도 같은 자리에서 막힌다.
*/
describe("기록 화면의 공유 실패 안내", () => {
  it("복사만 막혔으면 링크는 만들었다고 말한다", async () => {
    mockShareOrCopyLink.mockRejectedValue(new CopyFailedError());

    const viewer = await openViewer();
    await act(async () => {
      fireEvent.click(within(viewer).getByRole("button", { name: "공유" }));
    });

    expect(
      screen.getByText(
        "링크는 만들었지만 복사가 막혔어요. 브라우저에서 복사를 허용한 뒤 다시 눌러 주세요.",
      ),
    ).toBeInTheDocument();
  });

  it("링크를 못 만들었으면 준비 실패로 말한다", async () => {
    mockGetImageUrlByKey.mockRejectedValue(new Error("presign failed"));

    const viewer = await openViewer();
    await act(async () => {
      fireEvent.click(within(viewer).getByRole("button", { name: "공유" }));
    });

    expect(
      screen.getByText("공유 링크를 준비하지 못했어요."),
    ).toBeInTheDocument();
    // 주소를 못 받았으면 공유까지 가지도 않는다 — 복사 안내가 뜨면 그것이 거짓말이다.
    expect(mockShareOrCopyLink).not.toHaveBeenCalled();
  });
});

// 사용량 API는 프레임 개수만 준다. 빈 목록을 보관 기간 만료라고 추측하지 않는다.
it("빈 기록에서 확인되지 않은 보관 기간을 단정하지 않는다", async () => {
  await renderEmptyHistory();
  expect(screen.queryByText(/기록만 보여요/)).not.toBeInTheDocument();
  expect(mockGetMyUserInfo).not.toHaveBeenCalled();
});

/*
  카드는 사진·이름·날짜뿐이고, 누르면 크게 본다(기록 카드 시안 C안).
  저장·공유·지우기·이름 바꾸기는 보기 화면에만 있다 — 카드마다 버튼 세 개가 줄을 채웠었다.
*/
describe("기록을 크게 보는 화면", () => {
  const OLDER = {
    mediaId: 6,
    s3Key: "media/6.png",
    displayName: "산에서",
    createdAt: "2026-08-10T10:00:00",
  };

  it("목록 카드에는 버튼이 없고, 누르면 크게 보고, 닫으면 목록으로 돌아간다", async () => {
    await renderHistory();
    expect(screen.queryByRole("button", { name: "공유" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /사진 저장/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: CARD }));

    const viewer = screen.getByRole("dialog", { name: "바다에서" });
    expect(within(viewer).getByText("2026년 8월 15일 토요일")).toBeInTheDocument();
    expect(within(viewer).getByRole("button", { name: "사진 저장" })).toBeInTheDocument();
    // 뒤로가기(앱의 하드웨어 버튼 포함)가 보기 화면을 닫도록 주소에 남긴다.
    expect(window.location.search).toBe("?photo=7");

    fireEvent.click(within(viewer).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("옆 사진으로 넘기면 주소를 바꿔 끼운다 — 뒤로 한 번이면 목록이다", async () => {
    mockListMyMedia.mockResolvedValue([ITEM, OLDER]);
    await renderHistory();
    fireEvent.click(screen.getByRole("button", { name: CARD }));
    const pushedLength = window.history.length;

    let viewer = screen.getByRole("dialog", { name: "바다에서" });
    expect(within(viewer).getByText("1 / 2")).toBeInTheDocument();
    expect(within(viewer).getByRole("button", { name: "이전 사진" })).toBeDisabled();

    fireEvent.keyDown(document, { key: "ArrowRight" });
    viewer = screen.getByRole("dialog", { name: "산에서" });
    expect(within(viewer).getByText("2 / 2")).toBeInTheDocument();
    expect(window.location.search).toBe("?photo=6");
    expect(window.history.length).toBe(pushedLength);

    fireEvent.click(within(viewer).getByRole("button", { name: "이전 사진" }));
    expect(screen.getByRole("dialog", { name: "바다에서" })).toBeInTheDocument();
  });

  it("?photo= 주소로 들어오면 목록이 온 뒤 그 사진을 열고, 닫을 때는 주소만 지운다", async () => {
    window.history.replaceState(null, "", "/history?photo=7");
    const back = jest.spyOn(window.history, "back");

    await renderHistory();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    // 앞 기록은 이 화면이 쌓은 것이 아니다 — 되돌리면 기록 화면을 떠난다.
    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("이름 바꾸기 창에서 화살표 키는 사진을 넘기지 않는다", async () => {
    mockListMyMedia.mockResolvedValue([ITEM, OLDER]);
    const viewer = await openViewer();
    fireEvent.click(within(viewer).getByRole("button", { name: "더보기" }));
    fireEvent.click(within(viewer).getByRole("button", { name: "이름 바꾸기" }));

    fireEvent.keyDown(screen.getByRole("textbox", { name: "기록 이름" }), { key: "ArrowRight" });

    expect(screen.getByRole("dialog", { name: "바다에서" })).toBeInTheDocument();
  });

  it("달력에서 기록 있는 날을 누르면 그날 사진을 크게 본다", async () => {
    await renderHistory();
    fireEvent.click(screen.getByRole("button", { name: "달력" }));

    fireEvent.click(screen.getByRole("button", { name: "8월 15일 기록 1컷" }));

    expect(screen.getByRole("dialog", { name: "바다에서" })).toBeInTheDocument();
  });
});
