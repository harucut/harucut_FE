import { useDecorateStore } from "@/lib/decorateStore";

const BASE = { src: "data:image/png;base64,AA", width: 1000, height: 1500 };

function stickerIds() {
  return useDecorateStore.getState().components.map((c) => c.id);
}

describe("decorateStore 삭제 되돌리기", () => {
  beforeEach(() => {
    useDecorateStore.getState().reset();
    useDecorateStore.getState().setBase(BASE);
    // 아래 → 위 순서로 세 장을 쌓는다.
    useDecorateStore.getState().addSticker("/stickers/sticker-001.png");
    useDecorateStore.getState().addSticker("/stickers/sticker-002.png");
    useDecorateStore.getState().addSticker("/stickers/sticker-003.png");
  });

  // 되돌리기가 "이전 상태로 되돌리기"가 아니면 이름값을 못한다. 예전에는 지운 것을 배열
  // 끝에 붙여서, 중간에 있던 스티커가 항상 맨 위로 올라오며 합성 결과가 달라졌다.
  it("중간 레이어를 지웠다 되돌리면 원래 쌓임 순서로 돌아온다", () => {
    const before = stickerIds();
    const middle = before[1];

    useDecorateStore.getState().setActive(middle);
    useDecorateStore.getState().removeActive();
    expect(stickerIds()).toEqual([before[0], before[2]]);

    useDecorateStore.getState().restoreRemoved();
    expect(stickerIds()).toEqual(before);
  });

  it("맨 아래 레이어도 맨 아래로 돌아온다", () => {
    const before = stickerIds();

    useDecorateStore.getState().setActive(before[0]);
    useDecorateStore.getState().removeActive();
    useDecorateStore.getState().restoreRemoved();

    expect(stickerIds()).toEqual(before);
    // zIndex 는 배열 순서에 맞춰 다시 매겨진다.
    expect(useDecorateStore.getState().components.map((c) => c.zIndex)).toEqual([
      1, 2, 3,
    ]);
  });

  it("되돌린 뒤에는 되돌리기가 다시 켜지지 않는다", () => {
    useDecorateStore.getState().setActive(stickerIds()[0]);
    useDecorateStore.getState().removeActive();
    expect(useDecorateStore.getState().canRestoreRemoved).toBe(true);

    useDecorateStore.getState().restoreRemoved();
    expect(useDecorateStore.getState().canRestoreRemoved).toBe(false);
    expect(useDecorateStore.getState().lastRemoved).toBeNull();
  });
});
