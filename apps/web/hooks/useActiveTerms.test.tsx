import { act, renderHook, waitFor } from "@testing-library/react";
import { useActiveTerms } from "./useActiveTerms";
import { fetchActiveTerms } from "@/lib/termsApi";
jest.mock("@/lib/termsApi", () => ({ fetchActiveTerms: jest.fn(), termsContentHref: () => null }));
const terms = [{ code: "terms", title: "이용약관", required: true, version: 1, content: "현재 약관 본문" }];
beforeEach(() => jest.resetAllMocks());
it("빈 약관은 가입 가능으로 표시하지 않고 재조회 후 복구한다", async () => {
  jest.mocked(fetchActiveTerms).mockResolvedValueOnce([]).mockResolvedValueOnce(terms);
  const { result } = renderHook(useActiveTerms);
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.fromServer).toBe(false);
  expect(result.current.items).toEqual([]);
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.items[0].content).toBe("현재 약관 본문");
});
it.each([{ items: [] }, { items: [{ ...terms[0], content: "" }] }, { items: [{ ...terms[0], required: false }] }])("기록할 필수 약관이 없으면 가입을 열지 않는다: $items", async ({ items }) => {
  jest.mocked(fetchActiveTerms).mockResolvedValueOnce(items);
  const { result } = renderHook(useActiveTerms);
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
});
it("조회 실패는 대체 동의로 통과하지 않는다", async () => {
  jest.mocked(fetchActiveTerms).mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(useActiveTerms);
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
});
