import type { EventFrameRef, EventTheme } from "@/lib/event/types";

/**
 * 촬영 화면에서 결과 화면으로 넘어가는 순간의 행사 정보.
 *
 * 결과 화면은 서버 응답을 받아야 테마를 안다. 방금 「만들기」를 누른 사람에게 그 사이 테마 없는 「사진 받기」가
 * 뜨면 사진을 잃어버린 줄 안다. 같은 탭 안의 이동이므로 메모리로 넘긴다 — 저장소에 남기지 않고, 받아 간 뒤 지운다.
 * 토큰이 맞을 때만 내준다(다른 결과 링크에 이 행사의 얼굴을 씌우지 않는다).
 */
type Handoff = {
  token: string;
  eventName: string;
  theme?: EventTheme;
  /** 돌아가 한 번 더 찍을 곳. */
  eventPath: string;
  /** 방금 찍은 네 장과 고른 프레임. 합성을 기다리는 동안 보여 준다. 새로고침하면 없다. */
  photos?: Blob[];
  frame?: EventFrameRef;
};

let pending: Handoff | null = null;

export function stashResultHandoff(handoff: Handoff) {
  pending = handoff;
}

export function takeResultHandoff(token: string): Handoff | null {
  if (pending?.token !== token) return null;
  const taken = pending;
  pending = null;
  return taken;
}
