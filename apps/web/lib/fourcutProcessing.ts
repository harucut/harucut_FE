"use client";

import type { FrameId } from "@/constants/frames";
import type { FrameLayout } from "@/lib/canvas/composeFrame";
import { composeFourcutOnServer } from "@/lib/fourcutCompose";
import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";
import { getImageExtension, sanitizeDisplayName } from "@/lib/fourcutOutput";
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
  /** 게스트가 직접 붙인 이름을 처음 보관할 때만 지정한다. 결과 재조회는 이름을 쓰지 않는다. */
  initialDisplayName?: string;
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

  // 보여줄 URL 을 찾는다. 목록의 viewUrl 이 <img> 에 바로 쓰기 좋고(다운로드 강제가 없다),
  // 못 찾으면 download-url 로 폴백한다.
  let media = await findMyMedia(mediaId).catch(() => null);
  // 같은 멱등키는 이미 이름을 바꾼 기록을 돌려줄 수 있다. 일반 결과 조회에서는
  // PATCH하지 않는다. 게스트 인계도 이름을 못 읽었거나 사용자가 이미 고친 경우 보존한다.
  if (args.initialDisplayName && media?.displayName && /^harucut_\d{8}_\d{6}(?:\.(?:png|jpe?g))?$/i.test(media.displayName)) {
    media = await updateMediaDisplayName(
      mediaId,
      sanitizeDisplayName(args.initialDisplayName, media.displayName),
    ).then((updated) => ({ ...media!, ...updated })).catch(() => media);
  }
  const viewUrl = media?.viewUrl?.trim() || media?.downloadUrl?.trim() || null;
  const objectUrl = viewUrl ?? (await getMediaDownloadUrl(mediaId));

  const displayName = media?.displayName?.trim() || sanitizeDisplayName(args.displayName, "harucut");

  return {
    mediaId,
    objectUrl,
    downloadUrl: media?.downloadUrl?.trim() || objectUrl,
    displayName,
    extension: getImageExtension(media?.s3Key, media?.downloadUrl, objectUrl, displayName),
  } satisfies GeneratedFourcutAsset;
}
