"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import { newIdempotencyKey } from "@/lib/composeApi";
import { isBlankSourceComponent } from "@/lib/frameApi";
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
import type { ThemeExportJson } from "@/lib/types/themeEditor";

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
  /**
   * 이 키를 잡을 때 본 **프레임 내용**의 지문. 아직 못 읽었으면 null.
   *
   * `generationKey` 는 프레임을 `remoteFrameId` 라는 맨 숫자로만 가리킨다. 내용을 고쳐도
   * id 는 그대로라(수정은 같은 id 로 가는 PUT 이다) 지문을 따로 들고 있어야 한다.
   */
  frameContentKey: string | null;
  idempotencyKey: string;
};

/** 키 순서에 흔들리지 않게 직렬화한다. 같은 내용이 순서 때문에 다른 지문이 되면 안 된다. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));

  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

/**
 * 꾸민 프레임의 **내용** 지문. 프레임을 아직 못 읽었으면 null(= 모른다).
 *
 * 왜 필요한가: 배경·스티커·누끼를 고쳐도 `remoteFrameId` 는 그대로다. id 만으로 멱등키를
 * 잡으면 고친 뒤 다시 만들 때 서버가 **수정 전 작업을 재생한다**(같은 키 = 새로 그리지
 * 않는다, docs/backend-contract.md D-4). `FrameResponse` 에는 `updatedAt`·`version` 이
 * 없으므로 서버가 내려준 **내용 자체**로 지문을 만든다.
 *
 * 렌더 전용 주소(`renderUrl`, `background.url`)는 뺀다 — 서명 URL 이라 같은 프레임을 다시
 * 읽을 때마다 달라진다. 넣으면 내용이 그대로인데도 매번 새 키가 나가 같은 네컷이 보관함에
 * 두 벌 남는다. `id` 도 뺀다(서버가 다시 매기는 값이다).
 *
 * **저장 요청에서 빠지는 컴포넌트도 뺀다**(`isBlankSourceComponent` — 규칙의 소유자는
 * `lib/frameApi.ts` 다). 글자를 지운 TEXT 는 `toCreateFrameRequest` 가 요청에서 빼므로
 * 서버가 그리는 그림에 없다. 지문에 남겨 두면 **서버에 가지도 않는 레이어**를 옮기거나
 * 지우기만 해도 내용이 달라진 것으로 보여, 같은 그림이 새 멱등키로 두 벌 접수된다.
 * 서버에서 읽어 온 프레임에는 애초에 빈 레이어가 없으므로 그쪽에는 영향이 없다.
 */
export function buildFrameContentKey(
  theme: ThemeExportJson | null | undefined,
): string | null {
  if (!theme) return null;

  return stableStringify({
    frameId: theme.frameId,
    background:
      theme.background == null
        ? null
        : theme.background.type === "COLOR"
          ? { type: "COLOR", value: theme.background.value }
          : {
              type: "IMAGE",
              key: theme.background.key ?? "",
              opacity: theme.background.opacity ?? 1,
            },
    cellCutouts: theme.cellCutouts ?? null,
    components: theme.components
      .filter((component) => !isBlankSourceComponent(component))
      .map((component) => ({
        type: component.type,
        source: component.source,
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height,
        scale: component.scale,
        rotation: component.rotation,
        zIndex: component.zIndex,
        styleJson: component.styleJson ?? null,
      })),
  });
}

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
  ensureComposeIdempotencyKey: (
    generationKey: string,
    frameTheme?: ThemeExportJson | null,
  ) => string;
  noteRemoteFrameEdited: (remoteFrameId: number) => void;
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
   *
   * `frameTheme` 은 **`generationKey` 가 못 보는 축**이다. 프레임 내용을 고쳐도
   * `remoteFrameId` 는 그대로라 `generationKey` 가 안 변하므로, 내용을 지문으로 바꿔
   * (`buildFrameContentKey`) 세 갈래로 나눈다.
   *
   *  - 아직 **못 읽었을 때**(null): 쓰던 키를 그대로 준다. 테마는 네트워크로 늦게 오는데,
   *    모른다고 새 키를 잡으면 진행 중인 합성이 버려지고 같은 네컷이 두 벌 접수된다.
   *  - **처음 알게 됐을 때**: 지금 도는 작업이 쓴 내용이므로 키는 두고 지문만 새긴다.
   *  - **달라졌을 때**: 사용자가 프레임을 고친 것이다. 새 키를 잡고, 같이 `imageResult` 도
   *    버린다 — 그 그림은 수정 전 프레임으로 만든 것이라 화면에 남겨 두면 안 된다.
   */
  ensureComposeIdempotencyKey: (generationKey, frameTheme = null) => {
    const frameContentKey = buildFrameContentKey(frameTheme);
    const current = get().composeIdempotency;

    if (current?.generationKey === generationKey) {
      if (frameContentKey == null) return current.idempotencyKey;

      if (current.frameContentKey == null) {
        set({ composeIdempotency: { ...current, frameContentKey } });
        return current.idempotencyKey;
      }

      if (current.frameContentKey === frameContentKey) return current.idempotencyKey;
    }

    const idempotencyKey = newIdempotencyKey();
    set({
      composeIdempotency: { generationKey, frameContentKey, idempotencyKey },
      imageResult: null,
    });
    return idempotencyKey;
  },

  /**
   * 우리 편집기에서 프레임을 **고쳐 저장했을 때** 부른다. 쓰던 멱등키와 결과를 버린다.
   *
   * 왜 지문만으로는 부족한가: 위 `buildFrameContentKey` 지문은 프레임 **조회가 성공했을
   * 때만** 생긴다. 첫 조회가 실패한 세션은 지문이 `null` 로 남고, 그 뒤 프레임을 고쳐도
   * `ensureComposeIdempotencyKey` 가 「처음 알게 됐을 때」로 보고 쓰던 키를 유지한다 —
   * 서버가 수정 전 작업을 재생한다(docs/backend-contract.md D-4).
   *
   * 저장은 조회와 달리 **실패할 수 없는 사실**이다. 200 이 돌아왔으면 내용이 바뀐 것이
   * 확실하므로, 지문을 못 읽었더라도 여기서 키를 버릴 수 있다.
   *
   * 지금 촬영에 쓰는 프레임일 때만 버린다 — 다른 프레임을 고친 것은 이 결과와 무관하다.
   */
  noteRemoteFrameEdited: (editedFrameId) => {
    if (get().remoteFrameId !== editedFrameId) return;

    set({ composeIdempotency: null, imageResult: null });
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
