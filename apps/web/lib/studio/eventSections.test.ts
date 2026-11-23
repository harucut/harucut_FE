import { replaceRetentionDays } from "@/lib/studio/eventSections";
import { DEFAULT_RETENTION_DAYS, defaultConsentTemplate, draftChecklist, retentionMismatch } from "@/lib/studio/eventSections";

const READY = {
  byod: true,
  booth: false,
  layouts: ["CLASSIC"],
  frames: [{ layoutType: "CLASSIC", isDefault: true }],
  consents: [{ title: "사진", body: "주최자가 받아요", required: true }],
  kind: "SCHEDULED" as const,
  startsAt: "",
  endsAt: "",
  designed: false,
  usage: { composeQuota: 10, used: 0, reserved: 0, remaining: 10, entitlement: { scope: "EVENT" as const, validFrom: "x", validTo: "y" } },
};

function stateOf(rows: ReturnType<typeof draftChecklist>, key: string) {
  return rows.find((row) => row.key === key)?.state;
}

describe("게시 전 체크리스트", () => {
  it("다 채우면 디자인만 선택으로 남는다", () => {
    const rows = draftChecklist(READY);
    expect(rows.map((r) => r.state)).toEqual(["done", "done", "done", "done", "optional", "done"]);
  });

  it("고른 레이아웃에 프레임이 없거나 기본이 하나가 아니면 프레임이 미완이다", () => {
    expect(stateOf(draftChecklist({ ...READY, layouts: ["CLASSIC", "GRID"] }), "frames")).toBe("todo");
    expect(stateOf(draftChecklist({ ...READY, frames: [{ layoutType: "CLASSIC", isDefault: false }] }), "frames")).toBe("todo");
  });

  it("상시 캠페인에 종료 시각이 남아 있거나 종료가 시작보다 앞이면 일정이 미완이다", () => {
    expect(stateOf(draftChecklist({ ...READY, kind: "ALWAYS_ON", endsAt: "2026-11-01T18:00" }), "schedule")).toBe("todo");
    expect(
      stateOf(draftChecklist({ ...READY, startsAt: "2026-11-02T18:00", endsAt: "2026-11-01T18:00" }), "schedule"),
    ).toBe("todo");
  });

  it("제목이나 본문이 빈 필수 동의는 세지 않고, 이용권은 없으면 미완이다", () => {
    expect(stateOf(draftChecklist({ ...READY, consents: [{ title: "사진", body: " ", required: true }] }), "consent")).toBe("todo");
    expect(stateOf(draftChecklist({ ...READY, usage: { composeQuota: 0, used: 0, reserved: 0, remaining: 0 } }), "entitlement")).toBe("todo");
  });
});

describe("동의문과 보관 일수", () => {
  it("적힌 일수가 보관 일수와 다르면 그 숫자를 돌려준다", () => {
    expect(retentionMismatch(["결과 링크로 90일 동안 내려받을 수 있어요."], 30)).toEqual([90]);
  });

  it("일수가 없거나 맞는 값이 있으면 어긋나지 않았다", () => {
    expect(retentionMismatch(["주최자가 받아요."], 30)).toEqual([]);
    expect(retentionMismatch(["30일 보관해요. 행사 3일 전에 안내해요."], 30)).toEqual([]);
  });

  it("미리 넣는 동의 문구는 기본 보관 일수와 맞는다", () => {
    expect(retentionMismatch([defaultConsentTemplate("라온웨딩홀").body], DEFAULT_RETENTION_DAYS)).toEqual([]);
  });
});

describe("replaceRetentionDays", () => {
  it("적힌 보관 일수만 바꾸고 다른 일수와 숫자는 그대로 둔다", () => {
    expect(replaceRetentionDays("90일 보관해요. 행사 7일 전에 안내해요. 90 일 뒤 지워요. 2026년", 90, 30)).toBe(
      "30일 보관해요. 행사 7일 전에 안내해요. 30 일 뒤 지워요. 2026년",
    );
  });

  it("일수의 일부로 들어간 숫자는 바꾸지 않는다", () => {
    expect(replaceRetentionDays("190일 보관", 90, 30)).toBe("190일 보관");
  });
});
