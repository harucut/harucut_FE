"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { parseFrameIdQuery, type FrameId } from "@/constants/frames";
import { FramePicker, FramePickerConfirm } from "@/components/frame/FramePicker";
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
  /** 저장한 프레임을 고르지 않고 눌러서 바로 연다(꾸미기). 주면 컷 구성으로 거르지도 않는다(SavedFramesSection). */
  onOpenSavedFrame?: (frame: RemoteFrame) => void;

  /** 고르기 위(배너·게이지). */
  children?: ReactNode;
  /** 고르기 아래, 저장 목록 위(한도 안내 등). */
  belowPicker?: ReactNode;
};

/**
 * 프레임 고르는 화면 한 벌.
 *
 * `/shoot`·`/upload`·`/theme` 가 각자 같은 화면을 들고 있었다. 셋 다 주소의 `?frame=` 을
 * 읽고, 목록에서 고른 것과 손으로 고른 것을 합쳐 하나의 선택으로
 * 만들고, FramePicker 와 저장 목록을 같은 순서로 그렸다. 다른 것은 확인 버튼 문구와
 * 어디로 보내는지, 그리고 화면마다 하나씩 얹히는 것(게이지·행사 배너)뿐이었다.
 *
 * 그 공통부를 여기 모은다. 경로는 그대로 셋이다 — `/theme` 는 nav 항목이고, 경로 보호도
 * 경로 단위라 `/frame?mode=` 하나로 접으면 그것들이 전부 쿼리에 매달리게 된다. 줄이고 싶었던
 * 중복은 이 컴포넌트 하나로 사라진다.
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
  onOpenSavedFrame,
  children,
  belowPicker,
}: Props) {
  const searchParams = useSearchParams();
  const queriedFrameId = parseFrameIdQuery(searchParams.get("frame"));

  // 기본값을 둔다. 비워 두면 들어오자마자 비활성 버튼("프레임을 선택해주세요")을 먼저 만난다.
  // 가장 흔한 4컷을 미리 골라 두고 바꾸고 싶으면 바꾸게 한다.
  const [manualFrameId, setManualFrameId] = useState<FrameId>(
    queriedFrameId ?? "classic-4",
  );
  /*
    저장한 프레임은 목록에서 눌러서만 고른다. 예전에는 주소의 `?remoteFrameId=` 로도 골라 두고, 못 찾으면
    「링크에 담긴 전용 프레임을 불러오지 못했어요」를 띄웠다 — 그런 주소를 만드는 곳이 앱에도 서버에도 없어
    사용자가 볼 일 없는 길이었고, 문구도 무슨 말인지 알 수 없었다(2026-11-14 걷어냄). 행사 프레임은 행사 화면이
    서버가 준 목록으로만 고른다(components/participation).
  */
  const [selectedRemoteFrameId, setSelectedRemoteFrameId] = useState<number | null>(null);

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

  const handleConfirm = () => {
    if (!selectedFrameId) return;
    onConfirm({
      frameId: selectedFrameId,
      // 목록에 없는 번호는 넘기지 않는다 — 고른 뒤 새로고침에서 빠진 프레임(다른 기기에서 지움) 같은 경우다.
      //
      // 예전에는 목록에 없는 번호도 그대로 실었다. 사진을 다 찍은 뒤 저장 단계에서 서버가
      // 404(GEN-031, 없는/남의 프레임)로 거절해 촬영본이 통째로 날아갔다. 번호를 버리면 기본
      // 레이아웃으로 정상 저장된다.
      remoteFrameId: selectedRemoteFrame ? selectedRemoteFrameId : null,
    });
  };

  return (
    <>
      {children}

      <FramePicker
        selectedFrameId={selectedFrameId}
        onChangeSelected={(nextFrameId) => {
          setManualFrameId(nextFrameId);
          setSelectedRemoteFrameId(null);
        }}
      />

      {belowPicker}

      {hideSavedFrames ? null : (
        <SavedFramesSection
          title="저장한 프레임"
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
          onOpen={onOpenSavedFrame}
        />
      )}

      {/* 맨 끝에 둔다 — 그래야 저장 목록이 길어도 화면 아래에 붙어 있다. */}
      <FramePickerConfirm
        onConfirm={handleConfirm}
        confirmDisabled={confirmDisabled}
        confirmLabel={confirmLabel}
      />
    </>
  );
}
