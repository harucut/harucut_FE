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
  signal?: AbortSignal;
}): Promise<GeneratedFourcutAsset> {
  const { mediaId } = await composeFourcutOnServer({
    sources: args.sources,
    layout: args.layout,
    outputFilter: args.outputFilter,
    frameId: args.frameId,
    remoteFrameId: args.remoteFrameId,
    signal: args.signal,
  });

  // 이름은 서버가 먼저 짓는다(`harucut_20260820_014833.png`). 합성 요청에 이름 칸이 없어서,
  // 우리 규칙대로 부르려면 만들어진 뒤에 한 번 고쳐 준다. 실패해도 결과물은 멀쩡하므로 삼킨다.
  const displayName = sanitizeDisplayName(args.displayName, "harucut");
  await updateMediaDisplayName(mediaId, displayName).catch(() => undefined);

  // 보여줄 URL 을 찾는다. 목록의 viewUrl 이 <img> 에 바로 쓰기 좋고(다운로드 강제가 없다),
  // 못 찾으면 download-url 로 폴백한다.
  const media = await findMyMedia(mediaId).catch(() => null);
  const viewUrl = media?.viewUrl?.trim() || media?.downloadUrl?.trim() || null;
  const objectUrl = viewUrl ?? (await getMediaDownloadUrl(mediaId));

  return {
    mediaId,
    objectUrl,
    downloadUrl: media?.downloadUrl?.trim() || objectUrl,
    displayName,
  } satisfies GeneratedFourcutAsset;
}
