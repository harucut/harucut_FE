"use client";

import type { FrameId } from "@/constants/frames";
import type { FrameLayout } from "@/lib/canvas/composeFrame";
import { composeFourcutOnServer } from "@/lib/fourcutCompose";
import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";
import { sanitizeDisplayName } from "@/lib/fourcutOutput";
import type { FourcutFilterId } from "@/lib/frameFilters";
import {
  findMyMedia,
  getMediaDownloadUrl,
  updateMediaDisplayName,
} from "@/lib/userMediaApi";

/**
 * 네컷을 서버에 만들어 보관함에 남긴다.
 *
 * 예전 이름은 `uploadGeneratedFourcutFile` 이었고, 브라우저가 다 그린 **완성본 한 장**을
 * 받아 올렸다. 그 등록 API 가 사라져서(405) 지금은 **원본 4장을 넘긴다** —
 * 자세한 배경은 lib/fourcutCompose.ts 주석 참고.
 */
export async function saveFourcutToServer(args: {
  sources: string[];
  layout: FrameLayout;
  outputFilter: FourcutFilterId;
  frameId: FrameId | null;
  remoteFrameId: number | null;
  displayName: string;
  /** 같은 시도의 재시도라면 같은 값을 넘긴다 — 서버가 두 번 그리지 않는다. */
  idempotencyKey?: string;
  /** 사용자가 고른 배경색(`#RRGGBB`). 기본 프레임에서만 쓰인다. */
  backgroundColor?: string;
  signal?: AbortSignal;
}): Promise<GeneratedFourcutAsset> {
  const { mediaId } = await composeFourcutOnServer({
    sources: args.sources,
    layout: args.layout,
    outputFilter: args.outputFilter,
    frameId: args.frameId,
    remoteFrameId: args.remoteFrameId,
    idempotencyKey: args.idempotencyKey,
    backgroundColor: args.backgroundColor,
    signal: args.signal,
  });

  // 이름은 서버가 먼저 짓는다(`harucut_20260820_014833.png`). 합성 요청에 이름 칸이 없어서,
  // 우리 규칙대로 부르려면 만들어진 뒤에 한 번 고쳐 준다.
  //
  // 실패해도 결과물은 멀쩡하니 저장 자체를 되돌리지는 않는다. 다만 **우리가 요청한 이름을
  // 그대로 돌려주지는 않는다** — 그러면 화면에는 새 이름이, 보관함에는 서버가 지은 이름이
  // 남아 사용자가 기록에서 자기 네컷을 못 찾는다. 실제로 붙은 이름을 아래에서 다시 읽는다.
  const wantedName = sanitizeDisplayName(args.displayName, "harucut");
  const renamed = await updateMediaDisplayName(mediaId, wantedName)
    .then(() => true)
    .catch(() => false);

  // 보여줄 URL 을 찾는다. 목록의 viewUrl 이 <img> 에 바로 쓰기 좋고(다운로드 강제가 없다),
  // 못 찾으면 download-url 로 폴백한다.
  const media = await findMyMedia(mediaId).catch(() => null);
  const viewUrl = media?.viewUrl?.trim() || media?.downloadUrl?.trim() || null;
  const objectUrl = viewUrl ?? (await getMediaDownloadUrl(mediaId));

  // 이름 바꾸기가 실패했으면 보관함에 실제로 남은 이름을 쓴다(못 읽으면 요청한 이름으로 둔다).
  const storedName = media?.displayName?.trim();
  const displayName = renamed ? wantedName : storedName || wantedName;

  return {
    mediaId,
    objectUrl,
    downloadUrl: media?.downloadUrl?.trim() || objectUrl,
    displayName,
  } satisfies GeneratedFourcutAsset;
}
