"use client";

import type { FrameId } from "@/constants/frames";
import { drawCover, type Rect } from "@/lib/canvas/draw";
import { loadImage } from "@/lib/canvas/loaders";
import {
  cutoutPersonOnBlack,
  isPersonCutoutUnavailable,
} from "@/lib/canvas/personCutout";
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
import { getFrame, listAllFrames } from "@/lib/remoteFrameApi";
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
 * ## 누끼도 여기서 굽는다
 *
 * 필터와 같은 이유다. **`cellCutouts` 계약(무엇이 저장되고 누가 그리는가)은 여기 적지
 * 않는다** — 소유자는 `docs/backend-contract.md` 하나다(AGENTS.md 「규칙의 소유자」).
 * 아직 확인 중인 쟁점이라, 옮겨 적는 순간 두 진실이 갈린다.
 *
 * 그 문서가 정한 대로, 켜진 칸의 원본은 **올리기 전에** 사람만 남기고 배경을 검정으로 구운
 * 것으로 바꾼다(`lib/canvas/personCutout.ts`). 토글이 어디서 오는지는 `resolveComposeFrame`
 * 이 갖는다.
 *
 * 구운 픽셀이 사용자 눈에 닿는 곳은 결과 화면이다 — `app/shoot/result/page.tsx` 가 완성본을
 * 그대로 띄운다. 원본으로 만든 미리보기를 그 자리에 두면 화면과 저장본이 갈린다.
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

/**
 * 누끼 중간 산출물의 JPEG 품질.
 *
 * 이 JPEG 은 **브라우저 밖으로 나가지 않는다** — 바로 다음 줄에서 다시 디코드해 슬롯
 * 크기로 자르고 `SOURCE_QUALITY` 로 굽는다. 중간을 0.92 로 두면 같은 사진을 0.92 로 두 번
 * 압축해 손실이 겹치므로, 여기서는 크기를 포기하고 손실을 없앤다(파일은 즉시 버려진다).
 */
const CUTOUT_INTERMEDIATE_QUALITY = 1;

export class SystemFrameMissingError extends Error {
  constructor() {
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

/** 왜 누끼가 안 됐는지 한 줄로. 모델이 아는 실패면 그 사유를, 아니면 메시지를 쓴다. */
function describeCutoutFailure(error: unknown): string {
  if (isPersonCutoutUnavailable(error)) return error.reason;
  return error instanceof Error ? error.message : String(error);
}

type PreparedSources = {
  /** 굽기에 넘길 주소. 누끼가 성공한 칸만 원본 대신 blob URL 이 들어간다. */
  sources: string[];
  /** 다 쓰고 반드시 부른다. 안 부르면 blob 이 탭이 닫힐 때까지 산다. */
  release: () => void;
};

/**
 * 누끼가 켜진 칸의 원본을 **사람만 남고 배경이 검은** 사진으로 바꾼다.
 *
 * ## 원본 → 누끼 → 자르기·필터 순서인 이유
 *
 * 자르고 필터를 먹인 뒤에 누끼를 뜨면 세그멘테이션 입력이 흑백(`grayscale(1)`)이거나
 * 흐린(`blur(0.45px)`) 그림이 된다. 모델은 사람 사진으로 배운 것이라 굳이 그걸 먹일 이유가
 * 없다. 반대로 누끼를 먼저 뜨면 모델은 손대지 않은 원본을 보고, 뒤에 오는 필터는 검은
 * 배경에 안전하다 — `grayscale`·`brightness`·`contrast`·`saturate` 는 순수 검정을 검정으로
 * 남긴다. 자르기(`drawCover`)도 원본과 같은 식이라 사람 위치가 미리보기와 어긋나지 않는다.
 *
 * ## 한 장씩 도는 이유
 *
 * 실측(갤럭시 A32 · 안드로이드 13 · Chrome 151)으로 장당 약 450ms 다. `Promise.all` 로
 * 네 장을 같이 걸어도 빨라지지 않는다 — `delegate:'CPU'` 라 wasm 이 메인 스레드에서
 * **동기로** 돌아 세그멘테이션 구간은 어차피 줄을 선다. 대신 동시에 걸면 1700×1700 RGBA
 * 11.6MB 짜리 버퍼와 캔버스가 네 벌 한꺼번에 살아서, 중저가 안드로이드에서 얻는 것 없이
 * 메모리만 네 배로 쓴다. 그래서 순차다.
 *
 * 모델 로드 실패는 `personCutout` 이 캐시한다. 오프라인이어도 남은 칸이 각자 모델을 다시
 * 받으러 나가지 않고 바로 원본으로 떨어진다.
 *
 * ## 실패하면 그 칸만 원본으로 간다
 *
 * 누끼 하나 때문에 촬영 전체를 잃지 않는다. 켠 칸이 원본으로 나가면 사용자가 기대한 그림은
 * 아니지만, 던져서 네 장을 다 버리는 것보다 낫다 — 개발 로그에는 남긴다.
 */
async function bakePersonCutouts(
  sources: string[],
  cellCutouts: boolean[],
): Promise<PreparedSources> {
  const prepared = [...sources];
  const objectUrls: string[] = [];
  const release = () => {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls.length = 0;
  };

  for (let index = 0; index < sources.length; index += 1) {
    if (cellCutouts[index] !== true) continue;

    try {
      const { blob } = await cutoutPersonOnBlack(sources[index], {
        quality: CUTOUT_INTERMEDIATE_QUALITY,
      });
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      prepared[index] = url;
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[compose] ${index + 1}번째 칸 누끼를 굽지 못해 원본을 그대로 올린다: ${describeCutoutFailure(error)}`,
        );
      }
    }
  }

  return { sources: prepared, release };
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

export type ComposeFrameTarget = {
  /** 합성 요청에 실을 서버 프레임 id. */
  frameId: number;
  /**
   * 칸별 누끼 토글. 촬영 슬롯 순서로 **4개**이고, 켜진 칸은 올리기 전에 픽셀에 누끼를
   * 굽는다. 개수·저장·렌더링 계약은 `docs/backend-contract.md` 가 갖는다.
   */
  cellCutouts: boolean[];
};

/**
 * 프레임이 들고 있는 누끼 토글을 읽는다.
 *
 * 서버가 안 줬거나(누끼 필드가 생기기 전 프레임) 4개가 아니면 **전부 꺼진 것**으로 본다 —
 * `frameApi.toThemeExportJson` 이 쓰는 규칙과 같은 것이다(근거는 `docs/backend-contract.md`).
 */
function readCellCutouts(frame: RemoteFrame | null): boolean[] {
  const flags = frame?.cellCutouts;
  return flags?.length === 4
    ? flags.map(Boolean)
    : [false, false, false, false];
}

/**
 * 이번 합성이 쓸 프레임을 확정한다 — id 와 **그 프레임의 누끼 토글**을 같이 돌려준다.
 *
 * 누끼 토글은 프레임에만 있다. 촬영 세션이 들고 다니는 것은 `frameId`(로컬 카탈로그 문자열)
 * 와 `remoteFrameId`(서버 id) 둘뿐이라(`lib/shootSessionStore.ts`), 굽기에 필요한 값은
 * 여기서 프레임을 집는 김에 같이 읽는다. 화면이 미리보기용으로 따로 읽는
 * `hooks/useRemoteFrameTheme` 는 꾸민 프레임에서만 돌고 합성 경로로 내려오지 않는다.
 */
export async function resolveComposeFrame(
  frameId: FrameId | null,
  remoteFrameId: number | null,
): Promise<ComposeFrameTarget> {
  if (remoteFrameId != null) {
    // 꾸민 프레임은 id 가 곧 답이라 예전에는 아무것도 묻지 않았다. 누끼 토글 때문에 한 번
    // 읽는다 — 다만 **못 읽어도 합성은 보낸다.** 조회가 한 번 흔들렸다고 지금까지 되던
    // 저장을 죽이는 것보다, 누끼 없이 저장되는 편이 낫다(사용자가 다시 찍지 않아도 된다).
    const frame = await getFrame(remoteFrameId).catch((error: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[compose] 프레임(${remoteFrameId}) 조회에 실패해 누끼 없이 간다`,
          error,
        );
      }
      return null;
    });

    return { frameId: remoteFrameId, cellCutouts: readCellCutouts(frame) };
  }

  if (!frameId) throw new SystemFrameMissingError();

  const system = await findSystemFrame(frameId);
  if (!system) throw new SystemFrameMissingError();

  // 시스템 프레임도 같은 필드를 달고 온다. 목록으로 이미 받았으니 더 물을 것이 없다.
  return { frameId: system.frameId, cellCutouts: readCellCutouts(system) };
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
    /*
      `failureReason` 은 사용자에게 보여줄 문구가 아니다 — 스웨거가 그 필드 설명에
      박아 둔다: "사용자에게 그대로 보여줄 문구는 아니다"(2026-09-07 /v3/api-docs 실측).
      값은 합성 Lambda 의 실패 기록을 그대로 옮긴 것이라
      `errorType + ": " + errorMessage` 꼴이고, errorMessage 가 없으면 재시도 소진
      조건 문자열("RetriesExhausted") 자체다. 서버는 255자로 자르기만 할 뿐
      언어도 내용도 가리지 않는다(`failure_reason varchar(255)`).

      한글이 섞였는지 보는 관문으로도 못 거른다(apiError.ts 의 GEN-003 data[] 필터).
      예외 메시지가 한국어여도 앞에 클래스명이 붙어 나오기 때문이다
      ("java.lang.IllegalArgumentException: 원본 사진 수가 슬롯 수와 다르다").
      그래서 언어를 따지지 않고 통째로 버린다 — 일반 Error 의 message 를 버리는
      apiError.ts 의 getServerMessage 와 같은 규칙이다. 원인 추적은 콘솔에만 남긴다.
    */
    if (error.reason?.trim() && process.env.NODE_ENV !== "production") {
      console.error(`[compose] 서버 합성 실패: ${error.reason}`);
    }

    return {
      message: "서버가 네컷을 완성하지 못했어요. 다른 프레임으로 시도해 주세요.",
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
 * 원본 4장을 S3 에 올리고 key 를 슬롯 순서대로 돌려준다.
 *
 * `Promise.all` 은 첫 실패에 바로 빠져나간다. 그러면 아직 올라가는 중인 나머지 원본은
 * **함수가 끝난 뒤에** S3 에 도착하고, 그 key 는 아무도 모르는 채로 남는다. 사용자가 곧바로
 * 재시도하면 그 좀비 업로드 위에 4장이 또 겹친다. 그래서 전부 끝날 때까지 기다렸다가
 * (= 무엇이 올라갔는지 다 안 뒤에) 첫 실패를 던진다.
 *
 * 남은 원본을 여기서 지우지는 못한다 — 프론트에 파일 삭제 엔드포인트가 없고
 * (`/api/auth/user/files` 는 presigned-upload 뿐), 서버는 **합성에 성공했을 때만** 원본을
 * 지운다. 지속 정리는 백엔드 몫으로 넘겼다(`docs/app-shell-backend-requests.md` 4번).
 * 삭제 API 가 열리면 여기 모아 둔 `uploadedKeys` 를 그대로 넘기면 된다.
 *
 * 실패는 감싸지 않고 그대로 던진다 — `describeComposeFailure` 가 에러 코드로 분기한다.
 */
async function uploadSources(files: File[]): Promise<string[]> {
  const results = await Promise.allSettled(
    files.map((file) =>
      uploadToS3WithPresigned({
        file,
        type: PRESIGNED_UPLOAD_TYPES.FOURCUT_SOURCE,
        skipUrlResolve: true,
      }),
    ),
  );

  const uploadedKeys: string[] = [];
  let failure: PromiseRejectedResult | undefined;

  for (const result of results) {
    if (result.status === "fulfilled") {
      uploadedKeys.push(result.value.key);
    } else if (!failure) {
      failure = result;
    }
  }

  if (!failure) return uploadedKeys;

  // 합성에 쓰지 못할 원본이 S3 에 남았다. 지울 수단이 없으니 무엇이 남았는지라도 남긴다.
  if (uploadedKeys.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn(
      `[compose] 합성에 쓰지 못한 원본이 S3 에 남았다: ${uploadedKeys.join(", ")}`,
    );
  }

  throw failure.reason;
}

/**
 * 원본 4장을 올리고 서버 합성을 기다린다.
 *
 * `sources` 는 사용자가 고른 순서 그대로여야 한다 — 서버가 그 순서로 슬롯에 넣는다.
 * 합성에 성공하면 서버가 올린 원본 4장을 지운다(보관함에는 결과만 남는다).
 *
 * 뒤집으면 **합성이 실패하면 이미 올라간 원본은 그대로 남는다.** 프론트에는 지울 방법이
 * 없어서, 여기서는 "쓸 일 없는 원본을 덜 만드는 것"까지만 한다 — 프레임을 먼저 확정하고,
 * **누끼까지 포함해** 4장을 다 구운 뒤에 올린다. 접수 이후(`submitCompose`·`waitForCompose`)
 * 실패로 남는 원본 정리는 백엔드 몫이다(`docs/app-shell-backend-requests.md` 4번).
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
  // 누끼 토글도 여기서 같이 받는다 — 굽기가 그 값을 봐야 한다.
  const { frameId: composeFrameId, cellCutouts } = await resolveComposeFrame(
    args.frameId,
    args.remoteFrameId,
  );

  // 굽기와 올리기를 **나눈다**. 슬롯마다 "굽기 → 올리기"를 이어 붙여 4개를 동시에 돌리면,
  // 세 번째 굽기가 실패해도 나머지 세 장은 이미 S3 로 나간 뒤라 쓰이지 않을 원본만 남는다.
  // 굽기는 브라우저 안에서 끝나 실패해도 남는 게 없다 — 다 구운 다음에 올린다.
  //
  // 누끼도 그래서 **굽기 쪽**이다. 올리는 중간에 누끼를 뜨면 한 장이 어긋나는 순간
  // 절반만 올라간 상태가 된다.
  const prepared = await bakePersonCutouts(sources, cellCutouts);

  let files: File[];
  try {
    files = await Promise.all(
      prepared.sources.map(async (src, index) => {
        const blob = await renderSourceForSlot(
          src,
          layout.slots[index],
          outputFilter,
        );
        return new File([blob], `source-${index + 1}.jpg`, {
          type: SOURCE_MIME,
        });
      }),
    );
  } finally {
    // 누끼 blob 은 여기까지만 쓴다. 성공이든 실패든 되돌려 준다.
    prepared.release();
  }

  const sourceKeys = await uploadSources(files);

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
