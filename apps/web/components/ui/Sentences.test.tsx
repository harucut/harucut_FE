/**
 * 짧은 안내 글을 문장마다 새 줄에서 시작하게 나누는지 지킨다(2026-11-14).
 *
 * 화면에서는 줄이 나뉘고, 글자만 읽는 쪽(화면 낭독기·접근성 설명)에서는 원래 문장이
 * 빈칸까지 그대로 남아야 한다 — 「…했어요.다시…」처럼 붙어 읽히면 안 된다.
 */
import { render, screen } from "@testing-library/react";
import { Sentences, splitSentences } from "@/components/ui/Sentences";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

describe("splitSentences", () => {
  it("마침표·물음표·느낌표 뒤 빈칸에서 나누고 문장부호는 문장에 남긴다", () => {
    expect(splitSentences("탈퇴를 신청한 계정이에요. 취소하면 지금처럼 쓸 수 있어요.")).toEqual([
      "탈퇴를 신청한 계정이에요.",
      "취소하면 지금처럼 쓸 수 있어요.",
    ]);
    expect(splitSentences("지울까요? 되돌릴 수 없어요! 다시 확인해 주세요.")).toEqual([
      "지울까요?",
      "되돌릴 수 없어요!",
      "다시 확인해 주세요.",
    ]);
  });

  it("주소·숫자 안의 점에서는 나누지 않는다", () => {
    expect(splitSentences("help@harucut.com 으로 문의해 주세요. 1.5초 뒤에 닫혀요.")).toEqual([
      "help@harucut.com 으로 문의해 주세요.",
      "1.5초 뒤에 닫혀요.",
    ]);
  });

  it("한 문장이면 그대로 하나다", () => {
    expect(splitSentences("사진을 저장했어요.")).toEqual(["사진을 저장했어요."]);
  });
});

describe("Sentences", () => {
  it("문장 사이에 줄바꿈을 두되 글자는 원래 문장 그대로다", () => {
    const { container } = render(
      <p>
        <Sentences text="로그인을 마치지 못했어요. 다시 시도해 주세요." />
      </p>,
    );
    const paragraph = container.querySelector("p")!;

    expect(paragraph.querySelectorAll("br")).toHaveLength(1);
    // globals.css 가 이 표시를 보고 문단을 고르게 나눈다(text-wrap: balance).
    expect(paragraph.querySelector("br")).toHaveAttribute("data-sentence-break");
    expect(paragraph.textContent).toBe("로그인을 마치지 못했어요. 다시 시도해 주세요.");
  });

  it("한 문장이면 줄바꿈을 넣지 않는다", () => {
    const { container } = render(
      <p>
        <Sentences text="사진을 저장했어요." />
      </p>,
    );

    expect(container.querySelector("br")).toBeNull();
    expect(container.textContent).toBe("사진을 저장했어요.");
  });
});

describe("ConfirmDialog 설명", () => {
  it("두 문장 설명은 화면에서 두 줄이고, 다이얼로그 설명으로는 한 문장처럼 이어 읽힌다", () => {
    render(
      <ConfirmDialog
        title="탈퇴를 취소할까요?"
        description="탈퇴를 신청한 계정이에요. 취소하면 지금처럼 하루컷을 쓸 수 있어요."
        confirmLabel="탈퇴 취소하기"
        running={false}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "탈퇴를 취소할까요?" });

    expect(dialog).toHaveAccessibleDescription(
      "탈퇴를 신청한 계정이에요. 취소하면 지금처럼 하루컷을 쓸 수 있어요.",
    );
    expect(dialog.querySelector("#confirm-dialog-desc br")).not.toBeNull();
  });
});
