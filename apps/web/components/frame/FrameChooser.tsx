"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { parseFrameIdQuery, type FrameId } from "@/constants/frames";
import { FramePicker } from "@/components/frame/FramePicker";
import { SavedFramesSection } from "@/components/frame/SavedFramesSection";
import type { RemoteFrame } from "@/lib/api-types";
import { frameIdFromFrameType } from "@/lib/frameApi";

export type FrameChoice = {
  frameId: FrameId;
  /** 저장한 프레임을 고른 경우에만 번호가 있다. **못 불러온 번호는 null 이다.** */
  remoteFrameId: number | null;
};

type Props = {
  // 목록은 바깥이 들고 있는다. 요금제 게이지처럼 목록을 함께 봐야 하는 화면이 있어서다.
  frames: RemoteFrame[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;

  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: (choice: FrameChoice) => void;

  /** 비회원처럼 저장한 프레임을 볼 수 없는 경우. */
  hideSavedFrames?: boolean;
  savedFramesDescription?: string;
  /** 저장한 프레임에 붙는 부가 동작(예: 꾸미기의 "수정하기"). */
  savedFrameAction?: { label: string; onAction: (frame: RemoteFrame) => void };

  /**
   * 주소에 담긴 저장 프레임 번호를 못 불러왔을 때 보여 줄 안내.
   *
   * 무엇이 문제인지는 여기서 판정하고, 뭐라고 말할지는 화면이 정한다 — 촬영은
   * "촬영은 그대로 할 수 있어요"지만 다른 화면은 할 말이 다르다.
   */
  missingRemoteFrameNotice?: ReactNode;

  /** 고르기 위(배너·게이지). */
  children?: ReactNode;
  /** 고르기 아래, 저장 목록 위(한도 안내 등). */
  belowPicker?: ReactNode;
};

/**
 * 프레임 고르는 화면 한 벌.
 *
 * `/shoot`·`/upload`·`/theme` 가 각자 같은 화면을 들고 있었다. 셋 다 주소의 `?frame=`·
 * `?remoteFrameId=` 를 읽고, 목록에서 고른 것과 손으로 고른 것을 합쳐 하나의 선택으로
 * 만들고, FramePicker 와 저장 목록을 같은 순서로 그렸다. 다른 것은 확인 버튼 문구와
 * 어디로 보내는지, 그리고 화면마다 하나씩 얹히는 것(게이지·행사 배너)뿐이었다.
 *
 * 그 공통부를 여기 모은다. 경로는 그대로 셋이다 — `/theme` 는 nav 항목이자 `?remoteFrameId=`
 * 딥링크의 입구고, 경로 보호도 경로 단위라 `/frame?mode=` 하나로 접으면 그것들이 전부
 * 쿼리에 매달리게 된다. 줄이고 싶었던 중복은 이 컴포넌트 하나로 사라진다.
 */
export function FrameChooser({
  frames,
  isLoading,
  error,
  onRefresh,
  confirmLabel,
  confirmDisabled,
  onConfirm,
  hideSavedFrames,
  savedFramesDescription,
  savedFrameAction,
  missingRemoteFrameNotice,
  children,
  belowPicker,
}: Props) {
  const searchParams = useSearchParams();
  const queriedFrameId = parseFrameIdQuery(searchParams.get("frame"));
  const queriedRemoteFrameId = Number(searchParams.get("remoteFrameId"));

  // 기본값을 둔다. 비워 두면 들어오자마자 비활성 버튼("프레임을 선택해주세요")을 먼저 만난다.
  // 가장 흔한 4컷을 미리 골라 두고 바꾸고 싶으면 바꾸게 한다.
  const [manualFrameId, setManualFrameId] = useState<FrameId>(
    queriedFrameId ?? "classic-4",
  );
  const [selectedRemoteFrameId, setSelectedRemoteFrameId] = useState<number | null>(
    Number.isFinite(queriedRemoteFrameId) && queriedRemoteFrameId > 0
      ? queriedRemoteFrameId
      : null,
  );

  const selectedRemoteFrame = useMemo(
    () =>
      selectedRemoteFrameId == null
        ? null
        : frames.find((frame) => frame.frameId === selectedRemoteFrameId) ?? null,
    [frames, selectedRemoteFrameId],
  );

  const selectedFrameId = selectedRemoteFrame
    ? frameIdFromFrameType(selectedRemoteFrame.frameType)
    : manualFrameId;

  /*
    주소에 저장 프레임 번호가 있는데 그 프레임을 못 불러온 상태.

    프레임 조회는 인증이 필요해서, 행사 QR 로 들어온 비회원은 주최자가 만든 프레임을
    애초에 읽을 수 없다. 회원이라도 남의 프레임이면 목록에 없다. 조용히 기본 레이아웃으로
    떨어지면 사용자는 "그 프레임으로 찍고 있다"고 믿은 채 다른 결과물을 들고 간다.
  */
  const requestedRemoteFrameMissing =
    selectedRemoteFrameId != null && !isLoading && selectedRemoteFrame == null;

  const handleConfirm = () => {
    if (!selectedFrameId) return;
    onConfirm({
      frameId: selectedFrameId,
      // 못 불러온 번호는 넘기지 않는다.
      //
      // 예전에는 목록에 없는 번호도 그대로 실었다. 안내는 "촬영은 그대로 할 수 있어요"라고
      // 해 놓고, 사진을 다 찍은 뒤 저장 단계에서 서버가 404(GEN-031, 없는/남의 프레임)로
      // 거절해 촬영본이 통째로 날아갔다. 번호를 버리면 기본 레이아웃으로 정상 저장된다.
      remoteFrameId: selectedRemoteFrame ? selectedRemoteFrameId : null,
    });
  };

  return (
    <>
      {children}

      {requestedRemoteFrameMissing ? missingRemoteFrameNotice : null}

      <FramePicker
        selectedFrameId={selectedFrameId}
        onChangeSelected={(nextFrameId) => {
          setManualFrameId(nextFrameId);
          setSelectedRemoteFrameId(null);
        }}
        onConfirm={handleConfirm}
        confirmDisabled={confirmDisabled}
        confirmLabel={confirmLabel}
      />

      {belowPicker}

      {hideSavedFrames ? null : (
        <SavedFramesSection
          title="저장한 프레임"
          description={savedFramesDescription}
          emptyText="저장한 프레임이 없어요."
          selectedFrameId={selectedFrameId}
          frames={frames}
          isLoading={isLoading}
          error={error}
          selectedRemoteFrameId={selectedRemoteFrameId}
          onSelectRemoteFrame={(frame) => {
            setManualFrameId(frameIdFromFrameType(frame.frameType));
            setSelectedRemoteFrameId(frame.frameId);
          }}
          onRefresh={onRefresh}
          onAction={savedFrameAction?.onAction}
          actionLabel={savedFrameAction?.label}
          selectedStatusText="선택됨"
          idleStatusText="클릭해서 선택"
        />
      )}
    </>
  );
}
