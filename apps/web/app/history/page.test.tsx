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
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  return screen.getByRole("button", { name: "삭제: 바다에서" });
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

/** 삭제 버튼 → 확인 창 → "지우기" 까지. */
async function confirmDelete() {
  const deleteButton = await renderHistory();
  fireEvent.click(deleteButton);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
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
  it("삭제에 실패하면 확인 창을 닫고 사유를 화면에 남긴다", async () => {
    mockDeleteMedia.mockRejectedValue(new Error("boom"));

    await confirmDelete();

    // 확인 창이 남아 있으면 배너를 가린다.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("사진을 지우지 못했어요.")).toBeInTheDocument();
    // 지우지 못했으니 목록에도 그대로 있어야 한다.
    expect(
      screen.getByRole("button", { name: "삭제: 바다에서" }),
    ).toBeInTheDocument();
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
  */
  it("실패 문구는 목록이 길어도 화면에 붙어 있는다", async () => {
    mockDeleteMedia.mockRejectedValue(new Error("nope"));
    await confirmDelete();

    const banner = screen.getByText("사진을 지우지 못했어요.");
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
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(PAST_DELETE_DEADLINE_MS);
      });
      await act(async () => {});

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText(DELETE_STALLED_TEXT)).toBeInTheDocument();

      /*
        문구가 "지우지 못했어요"가 아닌 이유, 목록에서 빼지 않는 이유는 같다 —
        끊긴 쪽에서는 요청이 서버까지 갔는지 알 수 없다. 지워졌는데 남아 있다고 하거나
        안 지워졌는데 지웠다고 하거나, 어느 쪽이든 화면이 거짓말을 하게 된다.
      */
      expect(
        screen.getByRole("button", { name: "삭제: 바다에서" }),
      ).toBeInTheDocument();
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
      expect(
        screen.queryByRole("button", { name: "삭제: 바다에서" }),
      ).not.toBeInTheDocument();

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

      const deleteButton = await renderHistory();
      fireEvent.click(deleteButton);
      fireEvent.click(screen.getByRole("button", { name: "지우기" }));

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

    await renderHistory();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "공유" }));
    });

    expect(
      screen.getByText(
        "링크는 만들었지만 복사가 막혔어요. 브라우저에서 복사를 허용한 뒤 다시 눌러 주세요.",
      ),
    ).toBeInTheDocument();
  });

  it("링크를 못 만들었으면 준비 실패로 말한다", async () => {
    mockGetImageUrlByKey.mockRejectedValue(new Error("presign failed"));

    await renderHistory();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "공유" }));
    });

    expect(
      screen.getByText("공유 링크를 준비하지 못했어요."),
    ).toBeInTheDocument();
    // 주소를 못 받았으면 공유까지 가지도 않는다 — 복사 안내가 뜨면 그것이 거짓말이다.
    expect(mockShareOrCopyLink).not.toHaveBeenCalled();
  });
});

/*
  기록이 없을 때의 보관 기간 안내.

  이 문구는 **사용자 등급을 확인했을 때만** 할 수 있는 말이다. 서버가 등급을 안 줬거나
  우리가 모르는 등급(쿠폰으로 나가는 것·나중에 붙는 것)을 BASIC 으로 떨어뜨려 놓고
  "최근 3일 기록만 보여요" 라고 적으면, 정작 3개월·무제한인 사람에게 자기 기록이 이미
  사라졌다고 말하게 된다. 마이페이지가 등급 이름에 거는 규칙과 같다
  (app/mypage/page.test.tsx) — 확인된 등급만 말하고, 모르면 아무 말도 하지 않는다.
*/
describe("기록이 없을 때의 보관 기간 안내", () => {
  it("확인된 등급이면 그 등급의 보관 기간을 안내한다", async () => {
    mockGetMyUserInfo.mockResolvedValue({ planTier: "PLUS" });

    await renderEmptyHistory();

    expect(screen.getByText(/최근 3개월 기록만 보여요/)).toBeInTheDocument();
  });

  it("등급이 오지 않으면 기간을 안내하지 않는다", async () => {
    mockGetMyUserInfo.mockResolvedValue({});

    await renderEmptyHistory();

    expect(screen.queryByText(/기록만 보여요/)).not.toBeInTheDocument();
  });

  it("우리가 모르는 등급이면 기간을 안내하지 않는다", async () => {
    mockGetMyUserInfo.mockResolvedValue({ planTier: "ENTERPRISE" });

    await renderEmptyHistory();

    expect(screen.queryByText(/기록만 보여요/)).not.toBeInTheDocument();
  });

  it("등급 조회가 실패해도 목록은 그대로 그리고 기간만 뺀다", async () => {
    mockGetMyUserInfo.mockRejectedValue(new Error("boom"));

    await renderEmptyHistory();

    expect(screen.queryByText(/기록만 보여요/)).not.toBeInTheDocument();
  });
});
