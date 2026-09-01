"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import { newIdempotencyKey } from "@/lib/composeApi";
import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";
import {
  createEmptySlots,
  toggleIndexInSlots,
  type SelectionSlot,
} from "@/lib/selection";
import {
  DEFAULT_FOURCUT_FILTER,
  type FourcutFilterId,
} from "@/lib/frameFilters";
import { DEFAULT_FRAME_BACKGROUND_COLOR } from "@/lib/themeBackground";

/**
 * 네 컷에 넣을 사진이 어디서 왔는지.
 *
 * 사진이 자리잡은 뒤로는(4장 고르기 → 서버 합성 → 내려받기) 출처를 알 필요가 없다 —
 * 갤러리에서 고른 사진도 촬영본과 같은 data URL 이라 뒤 단계가 둘을 구분하지 않는다.
 * 다만 화면에 뭐라고 쓸지는 달라진다("촬영한 사진이 없어요" / "불러온 사진이 없어요").
 */
export type ShootSource = "camera" | "upload";

/**
 * 진행 중인 합성의 멱등키와, 그 키를 잡을 때 쓴 입력(`generationKey`).
 *
 * 키를 결과 화면 컴포넌트가 들고 있으면 화면을 나갔다 들어올 때마다 새로 잡힌다.
 * 그런데 화면을 떠나도 **이미 접수된 합성은 서버에서 계속 돈다** — 결과 화면의 cleanup 은
 * 화면 갱신만 막을 뿐 요청을 되돌리지 못한다. 그래서 재진입이 새 키로 다시 접수하면
 * 같은 네컷이 보관함에 두 벌 남는다. 키는 컴포넌트가 아니라 세션이 들고 있어야 한다.
 */
export type ComposeIdempotency = {
  generationKey: string;
  idempotencyKey: string;
};

type ShootSessionState = {
  frameId: FrameId | null;
  remoteFrameId: number | null;
  source: ShootSource;
  // 촬영본은 data URL 문자열 배열이다. 갤러리에서 불러온 사진도 같은 형태로 맞춰 담는다.
  shots: string[];
  selectedIndexes: SelectionSlot[];
  borderColor: string;
  outputFilter: FourcutFilterId;
  imageResult: GeneratedFourcutAsset | null;
  composeIdempotency: ComposeIdempotency | null;
  /**
   * 행사 이름. 행사장 QR 로 들어온 참가자는 `/shoot?event=...` 로 도착한다.
   * 그 사람은 우리 서비스를 고른 적이 없고 "이 행사에서 찍는다"고만 알고 있으므로,
   * 촬영이 끝날 때까지 어느 행사인지 화면에 남겨 둔다.
   */
  eventName: string | null;

  setFrameId: (id: FrameId) => void;
  setSource: (source: ShootSource) => void;
  setEventName: (name: string | null) => void;
  setRemoteFrameId: (id: number | null) => void;
  setBorderColor: (color: string) => void;
  setOutputFilter: (filter: FourcutFilterId) => void;
  setImageResult: (asset: GeneratedFourcutAsset | null) => void;
  ensureComposeIdempotencyKey: (generationKey: string) => string;
  clearResults: () => void;
  toggleSelect: (index: number) => void;
  clearSelection: () => void;
  addShotPhoto: (photoDataUrl: string) => void;
  addShotPhotos: (photoDataUrls: string[]) => void;
  removeShotPhoto: (index: number) => void;
  resetShots: () => void;
  reset: () => void;
};

const initialState: Pick<
  ShootSessionState,
  | "frameId"
  | "remoteFrameId"
  | "source"
  | "shots"
  | "selectedIndexes"
  | "borderColor"
  | "outputFilter"
  | "imageResult"
  | "composeIdempotency"
  | "eventName"
> = {
  frameId: null,
  remoteFrameId: null,
  source: "camera",
  shots: [],
  selectedIndexes: createEmptySlots(),
  borderColor: DEFAULT_FRAME_BACKGROUND_COLOR,
  outputFilter: DEFAULT_FOURCUT_FILTER,
  imageResult: null,
  composeIdempotency: null,
  eventName: null,
};

export const useShootSession = create<ShootSessionState>((set, get) => ({
  ...initialState,

  setFrameId: (frameId) =>
    set({
      frameId,
      imageResult: null,
    }),

  setRemoteFrameId: (id) =>
    set({
      remoteFrameId: id,
      imageResult: null,
    }),

  setBorderColor: (borderColor) =>
    set({
      borderColor,
      imageResult: null,
    }),

  setOutputFilter: (outputFilter) =>
    set({
      outputFilter,
      imageResult: null,
    }),

  setImageResult: (imageResult) => set({ imageResult }),

  /**
   * 이번 합성이 쓸 멱등키를 돌려준다. 같은 입력이면 이미 잡아 둔 키를 그대로 준다.
   *
   * 위 설정 함수들은 `imageResult` 만 비우고 이 값은 건드리지 않는다 — 비울 필요가 없다.
   * 입력이 바뀌면 `generationKey` 가 달라져 여기서 키를 새로 잡는다. 반대로 옛 키를 그냥
   * 남겨 두면 서버가 예전 작업을 재생해서, 사용자가 사진이나 색을 바꿔도 예전 그림이 나온다.
   */
  ensureComposeIdempotencyKey: (generationKey) => {
    const current = get().composeIdempotency;
    if (current?.generationKey === generationKey) return current.idempotencyKey;

    const idempotencyKey = newIdempotencyKey();
    set({ composeIdempotency: { generationKey, idempotencyKey } });
    return idempotencyKey;
  },

  clearResults: () =>
    set({
      imageResult: null,
    }),

  setSource: (source) => set({ source }),

  setEventName: (name) => set({ eventName: name }),

  toggleSelect: (index) =>
    set({
      selectedIndexes: toggleIndexInSlots(get().selectedIndexes, index),
      imageResult: null,
    }),

  // 4장 선택만 비운다(촬영본은 유지). '선택 초기화' 버튼이 세션 전체를 지우지 않도록.
  clearSelection: () =>
    set({
      selectedIndexes: createEmptySlots(),
      imageResult: null,
    }),

  addShotPhoto: (photoDataUrl) =>
    set((state) => ({
      shots: [...state.shots, photoDataUrl],
      imageResult: null,
    })),

  addShotPhotos: (photoDataUrls) =>
    set((state) => ({
      shots: [...state.shots, ...photoDataUrls],
      imageResult: null,
    })),

  // 한 장을 빼면 그 뒤 사진의 번호가 하나씩 당겨진다. 고른 자리는 번호로 들고 있으므로
  // 같이 비운다 — 그대로 두면 사용자가 고른 것과 다른 사진이 슬롯에 들어간다.
  removeShotPhoto: (index) =>
    set((state) => ({
      shots: state.shots.filter((_, i) => i !== index),
      selectedIndexes: createEmptySlots(),
      imageResult: null,
    })),

  resetShots: () =>
    set(() => ({
      shots: [],
      selectedIndexes: createEmptySlots(),
      imageResult: null,
    })),

  reset: () => set(() => initialState),
}));
