"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Props = {
  running: boolean;
  /** 탈퇴를 그대로 둔다 — 방금 받은 세션을 지운다. */
  onKeep: () => void;
  /** 탈퇴를 취소한다(reactivate). */
  onRecover: () => void;
};

/**
 * 탈퇴를 신청한 계정이 로그인하면 묻는 창(2026-11-14).
 *
 * 이메일 로그인(app/login)과 소셜 로그인 콜백(app/oauth2/callback)이 같은 창을 쓴다.
 * 소셜 쪽은 한때 브라우저 기본 확인창으로 다른 말(「재등록을 진행할까요?」)을 물었다 —
 * 들어온 길에 따라 같은 질문이 다르게 보이지 않게 문구를 여기 한 곳에 둔다.
 */
export function WithdrawalRecoveryDialog({ running, onKeep, onRecover }: Props) {
  return (
    <ConfirmDialog
      title="탈퇴를 취소할까요?"
      description="탈퇴를 신청한 계정이에요. 취소하면 지금처럼 하루컷을 쓸 수 있어요."
      confirmLabel="탈퇴 취소하기"
      runningLabel="취소하는 중"
      cancelLabel="로그아웃"
      running={running}
      onClose={onKeep}
      onConfirm={onRecover}
    />
  );
}
