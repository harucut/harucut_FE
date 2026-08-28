"use client";

import type { FrameId } from "@/constants/frames";
import { drawCover, type Rect } from "@/lib/canvas/draw";
import { loadImage } from "@/lib/canvas/loaders";
import {
  getApiErrorDetails,
  getUserFacingApiErrorMessage,
} from "@/lib/apiError";
import {
  ComposeFailedError,
  ComposeTimeoutError,
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
import type { RemoteFrame } from "@/lib/api-types";
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
 *
 * ## 배경색은 이제 요청으로 보낸다
 *
 * 예전 계약에는 색을 실을 자리가 없어서, 사용자가 고른 색이 미리보기에만 반영되고 저장본은
 * 프레임에 저장된 배경으로 나왔다. 그래서 회원에게는 색 고르기를 아예 막고
 * (`FrameOutputOptionsPanel.serverComposed`), 미리보기를 사실에 맞추려고 서버 프레임의
 * 배경을 따로 한 번 더 조회했다(`hooks/useServerFrameBackground`).
 *
 * 백엔드가 `ComposeRequest.backgroundColor` 를 열면서 그 우회로가 전부 필요 없어졌다.
 * 색은 요청에 실어 보내고, 잠금과 추가 조회는 걷어냈다.
 *
 * 단, **단색(COLOR) 배경 프레임에서만 보낼 수 있다** — 이미지 배경 프레임에 보내면 400 이다.
 * 그래서 꾸민 프레임(`remoteFrameId`)에는 보내지 않는다. 그 배경은 프레임에 저장돼 있고,
 * 이미지일 수도 있다.
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
export async function findSystemFrame(
  frameId: FrameId,
): Promise<RemoteFrame | null> {
  const wanted = frameTypeFromFrameId(frameId);
  const frames = await listAllFrames();

  // 같은 종류의 시스템 프레임이 여럿이면 **가장 먼저 등록된 것**을 쓴다.
  // 서버가 목록을 최신순으로 주기 때문에, 그냥 첫 번째를 집으면 운영에 프레임을 하나 더
  // 올리는 순간 기존 사용자의 결과물이 조용히 다른 프레임으로 바뀐다.
  // (정상적으로는 종류당 하나여야 한다 — 여럿이면 백엔드 쪽 정리가 필요하다)
  return (
    frames
      .filter((frame) => frame.isSystem && frame.frameType === wanted)
      .sort((a, b) => a.frameId - b.frameId)[0] ?? null
  );
}

export async function resolveComposeFrameId(
  frameId: FrameId | null,
  remoteFrameId: number | null,
): Promise<number> {
  if (remoteFrameId != null) return remoteFrameId;
  if (!frameId) throw new SystemFrameMissingError("classic-4");

  const system = await findSystemFrame(frameId);
  if (!system) throw new SystemFrameMissingError(frameId);
  return system.frameId;
}

export type ComposedFourcut = {
  mediaId: number;
};

export type ComposeFailure = {
  message: string;
  /** 같은 조건으로 다시 눌러 성공할 여지가 있는가. */
  retryable: boolean;
};

/**
 * 합성 실패를 사용자가 할 수 있는 일로 옮긴다.
 *
 * 예전에는 무엇이 잘못됐든 "이미지를 준비하지 못했어요. 다시 시도해 주세요." 하나였다.
 * 그런데 실패의 상당수는 **다시 눌러도 절대 성공하지 않는 것**이라(없는 프레임, 서버가
 * 읽지 못하는 스티커·글자, 요금제 한도), 그 문구가 사용자를 헛된 재시도에 가둔다.
 * 프레임을 바꾸면 된다는 사실은 화면 어디에도 없었다.
 */
export function describeComposeFailure(error: unknown): ComposeFailure {
  if (error instanceof SystemFrameMissingError) {
    return {
      message:
        "이 프레임으로는 아직 저장할 수 없어요. 다른 프레임을 골라 주세요.",
      retryable: false,
    };
  }

  if (error instanceof ComposeTimeoutError) {
    return {
      message: "합성이 예상보다 오래 걸려요. 잠시 후 다시 시도해 주세요.",
      retryable: true,
    };
  }

  if (error instanceof ComposeFailedError) {
    return {
      message:
        error.reason?.trim() ||
        "서버가 네컷을 완성하지 못했어요. 다른 프레임으로 시도해 주세요.",
      retryable: false,
    };
  }

  const { code, status } = getApiErrorDetails(error);

  // 프레임에 서버가 읽지 못하는 자산이 들어 있다. 되풀이해도 결과가 같다.
  if (code === "GEN-002" || code === "GEN-003") {
    return {
      message:
        "프레임에 넣은 스티커나 글자를 서버가 읽지 못했어요. 프레임 꾸미기에서 다시 저장한 뒤 시도해 주세요.",
      retryable: false,
    };
  }

  // 없는 프레임이거나 남의 프레임(GEN-031). 링크로 받은 전용 프레임에서 잘 난다.
  if (code === "GEN-031" || status === 404) {
    return {
      message: "고른 프레임을 찾을 수 없어요. 프레임을 다시 골라 주세요.",
      retryable: false,
    };
  }

  if (code?.startsWith("SUBS-") || status === 403) {
    return {
      message: getUserFacingApiErrorMessage(
        error,
        "지금 요금제로는 저장할 수 없어요.",
      ),
      retryable: false,
    };
  }

  return {
    message: getUserFacingApiErrorMessage(
      error,
      "이미지를 준비하지 못했어요. 다시 시도해 주세요.",
    ),
    retryable: true,
  };
}

/**
 * 합성을 요청한다. 색을 보냈다가 거절당하면 **색만 빼고 한 번 더** 시도한다.
 *
 * 서버는 단색(COLOR) 배경 프레임에만 `backgroundColor` 를 허용하고, 이미지 배경 프레임에
 * 보내면 400(GEN-002/GEN-003)이다. 어느 쪽인지 미리 알려면 프레임을 한 번 더 조회해야
 * 하는데, 그 조회를 걷어내려고 색을 보내게 된 것이라 앞뒤가 맞지 않는다.
 * 흔한 길(단색 프레임)에는 추가 요청이 없고, 드문 길에서만 한 번 더 간다.
 *
 * 첫 요청이 400 이면 작업이 만들어지지 않았으므로 같은 멱등키를 다시 써도 안전하다.
 */
async function submitCompose(
  base: { frameId: number; sourceKeys: string[]; idempotencyKey: string },
  backgroundColor: string | undefined,
) {
  if (!backgroundColor) return requestCompose(base);

  try {
    return await requestCompose({ ...base, backgroundColor });
  } catch (error) {
    const { code } = getApiErrorDetails(error);
    if (code === "GEN-002" || code === "GEN-003") {
      // 이미지 배경 프레임이었다. 프레임에 저장된 배경으로 합성한다.
      return requestCompose(base);
    }
    throw error;
  }
}

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
  /**
   * 재시도에 같은 값을 다시 넘기면 서버가 기존 작업을 그대로 돌려준다.
   * 생략하면 매번 새로 만든다(= 새 합성).
   */
  idempotencyKey?: string;
  /**
   * 사용자가 고른 배경색(`#RRGGBB`). 기본 프레임에서만 의미가 있다 —
   * 꾸민 프레임(`remoteFrameId`)은 저장된 배경을 쓰고, 그 배경이 이미지면 서버가 400 을 낸다.
   */
  backgroundColor?: string;
  signal?: AbortSignal;
}): Promise<ComposedFourcut> {
  const { sources, layout, outputFilter, signal } = args;

  if (sources.length !== layout.slots.length) {
    throw new Error("sources length must match slot count");
  }

  // 프레임을 **먼저** 확정한다. 예전에는 업로드와 나란히 돌렸는데, 프레임 조회가
  // 실패할 운명이어도 원본 4장은 이미 S3 로 나간 뒤라 쓰이지 않을 파일만 남았다
  // (합성이 성공해야 서버가 원본을 지운다). 몇백 ms 를 아끼자고 치르기엔 비싼 값이다.
  const composeFrameId = await resolveComposeFrameId(
    args.frameId,
    args.remoteFrameId,
  );

  const sourceKeys = await Promise.all(
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
  );

  // 꾸민 프레임은 저장된 배경을 그대로 쓴다. 그 배경이 이미지면 색을 보내는 순간 400 이라,
  // "내 프레임인가"를 기준으로 보낼지 말지를 가른다.
  const usesStoredBackground = args.remoteFrameId != null;
  const wantedBackgroundColor = usesStoredBackground
    ? undefined
    : args.backgroundColor;

  const base = {
    frameId: composeFrameId,
    sourceKeys,
    idempotencyKey: args.idempotencyKey ?? newIdempotencyKey(),
  };

  const job = await submitCompose(base, wantedBackgroundColor);

  const done = await waitForCompose(job.jobId, { signal });
  if (done.mediaId == null) {
    throw new Error("compose finished without a mediaId");
  }

  return { mediaId: done.mediaId };
}
