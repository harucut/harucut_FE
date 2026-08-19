"use client";

import type { FrameId } from "@/constants/frames";
import { drawCover, type Rect } from "@/lib/canvas/draw";
import { loadImage } from "@/lib/canvas/loaders";
import {
  newIdempotencyKey,
  requestCompose,
  waitForCompose,
} from "@/lib/composeApi";
import { frameTypeFromFrameId } from "@/lib/frameApi";
import {
  getFourcutFilterCanvasValue,
  type FourcutFilterId,
} from "@/lib/frameFilters";
import {
  PRESIGNED_UPLOAD_TYPES,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";
import { listAllFrames } from "@/lib/remoteFrameApi";
import type { FrameLayout } from "@/lib/canvas/composeFrame";

/**
 * 네컷 완성을 서버에 맡긴다.
 *
 * 예전에는 브라우저가 네컷 한 장을 다 그린 뒤 그 결과물을 업로드해 보관함에 등록했다.
 * 그 등록 API(`POST /api/auth/user/media`)가 사라졌다(405). 지금 계약은 반대다 —
 * **원본 4장을 올리고 서버가 그린다.** 스웨거도 못박아 뒀다:
 * "완성된 네컷을 올리는 타입은 없다. 결과물은 합성 API 가 서버에서 만들어 저장한다."
 *
 * 서버가 더 잘하는 것도 있다. 브라우저 캔버스는 iOS 넓이 상한(`fitCanvasScale`) 때문에
 * 24MP 레이아웃을 16MP 로 줄여 그리는데, 서버는 항상 원래 크기로 그린다.
 * 실측으로 CLASSIC 결과가 2000×6000 그대로 나오는 것을 확인했다.
 *
 * ## 필터는 여기서 굽는다
 *
 * 서버는 필터(뽀샤시·밝게·흑백)를 모른다. 그래서 **사용자가 고른 효과를 각 사진 픽셀에
 * 새겨서** 올린다. 서버는 효과가 이미 입혀진 사진을 받아 배치만 한다.
 *
 * ## 슬롯 크기로 잘라서 올린다
 *
 * 서버도 cover 로 맞춰 주지만, 자르는 기준이 우리 미리보기와 미세하게 다를 수 있다.
 * 슬롯과 **같은 크기·비율**로 미리 잘라 올리면 서버 쪽 배치가 1:1 이 되어
 * 미리보기와 결과가 어긋날 여지가 없다.
 *
 * 실측(docs/backend-contract.md): 색이 다른 4장을 CLASSIC 으로 합성한 결과의 슬롯 중심
 * 픽셀이 `constants/frameLayouts.ts` 좌표와 정확히 일치했다.
 */

/** 원본은 사진이라 PNG 대신 JPEG 로 굽는다 — 슬롯 하나가 4MP까지 가서 PNG면 10MB 제한에 걸린다. */
const SOURCE_MIME = "image/jpeg";
const SOURCE_QUALITY = 0.92;

export class SystemFrameMissingError extends Error {
  constructor(readonly frameId: FrameId) {
    super("이 프레임으로는 아직 저장할 수 없어요.");
    this.name = "SystemFrameMissingError";
  }
}

/**
 * 고른 사진 한 장을 슬롯 크기로 잘라 필터를 입힌 JPEG 으로 만든다.
 * 자르는 방식(`drawCover`)과 필터 값은 미리보기가 쓰는 것과 같은 것이어야 한다.
 */
async function renderSourceForSlot(
  src: string,
  slot: Rect,
  outputFilter: FourcutFilterId,
): Promise<Blob> {
  const image = await loadImage(src);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(slot.width);
  canvas.height = Math.round(slot.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context not available");

  // 캔버스 전체가 슬롯이므로 원점 기준 사각형에 그린다.
  const target: Rect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  ctx.filter = getFourcutFilterCanvasValue(outputFilter);
  drawCover(
    ctx,
    image,
    image.naturalWidth || image.width || 1,
    image.naturalHeight || image.height || 1,
    target,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("source blob create failed"));
        resolve(blob);
      },
      SOURCE_MIME,
      SOURCE_QUALITY,
    );
  });
}

/**
 * 합성에 쓸 서버 프레임 ID 를 찾는다.
 *
 * 사용자가 직접 만든 프레임을 골랐으면 그 id 를 그대로 쓴다.
 * 기본 프레임(로컬 카탈로그의 `classic-4` 같은 문자열)은 서버에 **시스템 프레임**으로
 * 등록돼 있고, 그 id 는 환경마다 다르다. 그래서 번호를 코드에 박지 않고 목록에서 찾는다 —
 * 시스템 프레임은 요금제 한도와 무관하게 BASIC 계정 목록에도 항상 들어온다(스웨거).
 */
export async function resolveComposeFrameId(
  frameId: FrameId | null,
  remoteFrameId: number | null,
): Promise<number> {
  if (remoteFrameId != null) return remoteFrameId;
  if (!frameId) throw new SystemFrameMissingError("classic-4");

  const wanted = frameTypeFromFrameId(frameId);
  const frames = await listAllFrames();

  // 같은 종류의 시스템 프레임이 여럿이면 **가장 먼저 등록된 것**을 쓴다.
  // 서버가 목록을 최신순으로 주기 때문에, 그냥 첫 번째를 집으면 운영에 프레임을 하나 더
  // 올리는 순간 기존 사용자의 결과물이 조용히 다른 프레임으로 바뀐다.
  // (정상적으로는 종류당 하나여야 한다 — 여럿이면 백엔드 쪽 정리가 필요하다)
  const system = frames
    .filter((frame) => frame.isSystem && frame.frameType === wanted)
    .sort((a, b) => a.frameId - b.frameId)[0];

  if (!system) throw new SystemFrameMissingError(frameId);
  return system.frameId;
}

export type ComposedFourcut = {
  mediaId: number;
};

/**
 * 원본 4장을 올리고 서버 합성을 기다린다.
 *
 * `sources` 는 사용자가 고른 순서 그대로여야 한다 — 서버가 그 순서로 슬롯에 넣는다.
 * 합성에 성공하면 서버가 올린 원본 4장을 지운다(보관함에는 결과만 남는다).
 */
export async function composeFourcutOnServer(args: {
  sources: string[];
  layout: FrameLayout;
  outputFilter: FourcutFilterId;
  frameId: FrameId | null;
  remoteFrameId: number | null;
  signal?: AbortSignal;
}): Promise<ComposedFourcut> {
  const { sources, layout, outputFilter, signal } = args;

  if (sources.length !== layout.slots.length) {
    throw new Error("sources length must match slot count");
  }

  // 프레임 조회와 원본 굽기를 같이 시작한다 — 서로 기다릴 이유가 없다.
  const [composeFrameId, sourceKeys] = await Promise.all([
    resolveComposeFrameId(args.frameId, args.remoteFrameId),
    Promise.all(
      sources.map(async (src, index) => {
        const blob = await renderSourceForSlot(
          src,
          layout.slots[index],
          outputFilter,
        );
        const file = new File([blob], `source-${index + 1}.jpg`, {
          type: SOURCE_MIME,
        });
        const uploaded = await uploadToS3WithPresigned({
          file,
          type: PRESIGNED_UPLOAD_TYPES.FOURCUT_SOURCE,
          skipUrlResolve: true,
        });
        return uploaded.key;
      }),
    ),
  ]);

  const job = await requestCompose({
    frameId: composeFrameId,
    sourceKeys,
    idempotencyKey: newIdempotencyKey(),
  });

  const done = await waitForCompose(job.jobId, { signal });
  if (done.mediaId == null) {
    throw new Error("compose finished without a mediaId");
  }

  return { mediaId: done.mediaId };
}
