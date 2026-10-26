import {
  forgetParticipant,
  readBoothDevice,
  readParticipant,
  saveBoothDevice,
  saveParticipant,
} from "@/lib/event/credentialStore";

describe("행사 자격 보관", () => {
  beforeEach(() => window.localStorage.clear());

  // R5 14절 — 한 브라우저의 두 탭이 서로 다른 행사에 참여해도 덮어쓰지 않는다.
  it("참가자 자격은 행사마다 따로 둔다", () => {
    saveParticipant("evt-a", { token: "a", participantId: "pa", expiresAt: "2999-01-01T00:00:00Z" });
    saveParticipant("evt-b", { token: "b", participantId: "pb", expiresAt: "2999-01-01T00:00:00Z" });

    expect(readParticipant("evt-a")?.token).toBe("a");
    expect(readParticipant("evt-b")?.token).toBe("b");

    forgetParticipant("evt-a");
    expect(readParticipant("evt-a")).toBeNull();
    expect(readParticipant("evt-b")?.token).toBe("b");
  });

  it("만료된 참가자 자격은 돌려주지 않고 지운다", () => {
    saveParticipant("evt-a", { token: "a", participantId: "pa", expiresAt: "2000-01-01T00:00:00Z" });
    expect(readParticipant("evt-a")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("부스 기기 자격은 하나만 둔다", () => {
    saveBoothDevice({ token: "b1", deviceId: "d1", eventId: "e1" });
    saveBoothDevice({ token: "b2", deviceId: "d1", eventId: "e2" });
    expect(readBoothDevice()).toEqual({ token: "b2", deviceId: "d1", eventId: "e2" });
  });

  // 개인 서비스의 저장소와 섞지 않는다.
  it("개인 서비스의 키를 건드리지 않는다", () => {
    window.localStorage.setItem("harucut:theme-editor-draft:v2:u:classic-4", "{}");
    saveParticipant("evt-a", { token: "a", participantId: "pa", expiresAt: "2000-01-01T00:00:00Z" });
    readParticipant("evt-a");
    expect(window.localStorage.getItem("harucut:theme-editor-draft:v2:u:classic-4")).toBe("{}");
  });
});

// Codex 리뷰(#523): 저장소 쓰기가 막히면 연결로 받은 기기 자격을 잃어 연결 화면에 남았다.
it("저장소에 쓰지 못해도 이번 방문 동안은 받은 부스 자격을 돌려준다", () => {
  const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });
  try {
    saveBoothDevice({ token: "b-mem", deviceId: "d-1", eventId: "evt-1" });
    expect(readBoothDevice()?.token).toBe("b-mem");
  } finally {
    setItem.mockRestore();
  }
});

// Codex 리뷰(#541): 다른 탭이 회수(BOOTH-003)로 지운 자격을 이 탭이 메모리에서 되살리면 안 된다.
it("저장소에 저장된 부스 자격을 다른 탭이 지우면 메모리에서 되살리지 않는다", () => {
  window.localStorage.clear();
  saveBoothDevice({ token: "b-1", deviceId: "d-1", eventId: "evt-1" });
  expect(readBoothDevice()?.token).toBe("b-1");
  // 다른 탭의 forgetBoothDevice — 이 탭의 메모리는 건드리지 못하고 저장소만 지운다.
  window.localStorage.removeItem("harucut:event:booth-device");
  expect(readBoothDevice()).toBeNull();
});
