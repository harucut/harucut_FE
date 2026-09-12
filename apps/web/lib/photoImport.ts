"use client";

import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { fitCanvasScale } from "@/lib/canvas/canvasBudget";
import { canUploadAsIs, decodeImageFile, looksLikeHeif } from "@/lib/imageDecode";
import { UNSUPPORTED_UPLOAD_MESSAGE } from "@/lib/presignedUploadApi";

/**
 * 갤러리에서 고른 사진을 촬영본과 **같은 모양**으로 바꾼다.
 *
 * 이 뒤의 단계(4장 고르기 → 서버 합성 → 내려받기)는 사진이 카메라에서 왔는지 파일에서
 * 왔는지 몰라도 된다. 그러려면 여기서 형태를 맞춰 줘야 한다 — 촬영본은 data URL 문자열이다.
 *
 * **비율은 건드리지 않는다.** 합성 단계(`lib/fourcutCompose.ts` `renderSourceForSlot`)가
 * 올리기 전에 슬롯 크기로 `cover` 잘라내고(2026-08-24 실측: 16:9 원본의 모서리가 잘려
 * 나가고 슬롯이 사진으로 꽉 찼다 — 배경색 여백이 남지 않았다), 미리보기도 `object-cover` 라
 * 화면과 결과물이 같은 규칙을 쓴다. 여기서 미리 자르면 뒤 단계가 쓸 수 있었던 화소를
 * 먼저 버리는 셈이다.
 *
 * 크기만 줄인다. 이유가 둘이다.
 *  1. 이 화면은 한 번에 **칸 수 × 6장**(지금 24장)을 담는다
 *     (`app/shoot/upload/page.tsx` 의 `PHOTOS_PER_SLOT`). 그 전부가 data URL 문자열로
 *     세션과 DOM 에 남아서, 요즘 폰 사진을 원본 크기로 담으면 모바일 웹뷰가 이 흐름만으로
 *     멎는다. (예전 주석은 「비회원 인계가 localStorage 5MB 에 걸린다」고 적었는데 그 이유는
 *     더는 맞지 않는다 — 인계는 IndexedDB 로 옮겼다. docs/README.md 「인계 보관소를
 *     IndexedDB 로 옮겼다」가 그 이유의 소유자이고, 같은 두 가지를 적고 있다.)
 *  2. 슬롯보다 큰 화소는 어차피 잘려 나가니 올리는 시간만 늘린다.
 */

const ALL_SLOTS = Object.values(FRAME_LAYOUTS).flatMap((layout) => layout.slots);

/**
 * 한 장이 들 수 있는 **화소 수**. 긴 변이 아니라 넓이로 건다.
 *
 * ## 왜 긴 변이 아닌가
 *
 * 예전에는 「긴 변 ≤ 모든 슬롯의 가장 긴 변(2400)」이었다. 그러면 슬롯과 **방향이 다른**
 * 사진에서 짧은 변이 먼저 말라붙는다. 합성 단계가 슬롯 크기 캔버스에 `drawCover` 로
 * 그리는데(`lib/canvas/draw.ts` 의 배율에는 1 상한이 없다) 그때 늘리는 것은 **짧은 변**이다.
 * 실측이 아니라 계산으로 확인한 값이다(2026-09-10, `photoImport.test.ts`):
 *
 *  - 16:9 가로 사진 → 2400×1350 → grid-4·polaroid-4(1700×2400)에서 **1.78배** 확대.
 *  - 같은 사진이 가로 슬롯인 wide-4(2400×1700)에서도 **1.26배** — 사진이 슬롯보다 납작해서다.
 *
 * ## 넓이로 걸면 어떻게 되나
 *
 * 비율은 여기서 건드리지 않으므로(위 파일 주석) 넓이 P 를 주면 짧은 변은 √(P/r), 긴 변은
 * √(P·r) 이 된다(r = 긴 변 ÷ 짧은 변). 확대율이 **r 에서 √r 로** 떨어진다 — 자르지 않는
 * 한 같은 예산에서 이보다 나은 배분은 없다. 16:9 는 1.78배 → 1.33배, 4:3 은 1.33배 →
 * 1.15배, wide-4·classic-4 의 확대는 아예 사라진다(각각 r ≤ 2, r ≤ 4 까지).
 *
 * ## 값 — 「모든 슬롯을 한 번에 덮는 가장 작은 직사각형」
 *
 * 어느 슬롯에서도 확대가 없으려면 가로가 **가장 넓은 슬롯의 가로**(지금 2400, wide-4)와
 * 세로가 **가장 긴 슬롯의 세로**(지금 2400, grid-4·polaroid-4)를 동시에 넘겨야 한다.
 * 그 직사각형의 넓이가 이 값이다. 레이아웃이 늘거나 커져도 따라오게 상수에서 뽑는다.
 *
 * ## 무엇을 치르는가 — **천장은 그대로, 실제 사진은 무거워진다**
 *
 * 천장은 안 움직인다. 예전 규칙의 최대 넓이는 정사각형 원본일 때의 (가장 긴 변)² 이었고,
 * 여기 값은 (가장 넓은 가로)×(가장 긴 세로)라 두 인수가 모두 슬롯의 한 변이므로 **어떤
 * 레이아웃에서도** 그 제곱 이하다.
 *
 * **그러나 천장에 닿던 것은 정사각형 하나뿐이었다.** 예전 규칙에서 축소가 걸린 사진의
 * 넓이는 E²/r(E = 2400, r = 비율)이라, 이제 카메라가 내놓는 모든 비율이 천장에 붙는다 —
 * 출력 화소가 정확히 **r 배**로 는다. 계산으로 확인한 값(2026-09-10, `photoImport.test.ts`):
 *
 *  - 4:3(아이폰 기본) 4.32MP → 5.76MP (**+33%**)
 *  - 3:2 3.84MP → 5.76MP (**+50%**)
 *  - 16:9 3.24MP → 5.76MP (**+78%**)
 *  - 1:1 5.76MP → 5.76MP (그대로 — 예전에도 천장이었다)
 *
 * 24장 최악은 `docs/README.md` 실측 환산으로 약 43MB → 43MB(정사각형 기준 변화 없음),
 * 4:3 기준으로는 약 32MB → 43MB 다. **이 값을 치르고 사는 것이 이 상수의 판단이다.**
 *
 * ## 이득이 모든 프레임에 고르지 않다
 *
 * 값은 네 프레임이 다 내는데 이득은 고르지 않다. 4:3 사진은 예전에도 classic-4(0.71배)와
 * wide-4(1.00배)에서 확대가 없었으므로, 그 두 프레임만 쓰는 사람은 **이득 0 · 비용 +33%**
 * 다. 이득은 세로 슬롯(grid-4·polaroid-4)의 1.33배 → 1.15배와 wide-4 의 16:9(1.26배 → 없음)
 * 에 몰린다. 그래도 넓이로 건 이유는, 프레임은 **불러온 뒤에 바뀔 수 있어서**(아래 「왜
 * 슬롯 비율로 자르지 않나」) 불러오는 시점에 어느 프레임에 쓸지 알 수 없기 때문이다.
 *
 * ## 왜 슬롯 비율로 자르지 않나
 *
 * 불러온 사진은 **프레임을 바꿔도 남는다** — `app/shoot/page.tsx` 가 일부러 그렇게 만들었고
 * 그 파일 테스트가 지킨다(자르기는 미리보기·합성이 새 프레임 기준으로 한다). 불러오는
 * 시점의 프레임에 맞춰 자르면, 프레임을 바꾼 사람의 사진은 이미 잘린 뒤다.
 *
 * ## 남는 한계 — 세로 슬롯 × 가로 사진의 확대는 없어지지 않는다
 *
 * 완전히 없애려면 짧은 변을 2400 으로 붙들어야 하고, 그러면 16:9 한 장이 4267×2400 =
 * 10.2MP 가 된다. 24장이면 5.76MP×24 에서 10.2MP×24 로 뛴다. docs/README.md 실측
 * (q=0.92 data URL, 1700×2400 = 4.08MP 사진 한 장이 1.46MB/2.25MB, 실기기 카메라 사진은
 * 2.17MP 에 0.68MB)으로 환산하면 대략 **43~76MB → 76~135MB** 다. 이 흐름이 모바일 웹뷰에서
 * 수백 MB 를 잡아 멎던 자리라(`PHOTOS_PER_SLOT` 주석) 화질로 그 방어를 무너뜨리지 않기로
 * 했다. 남는 확대는 위 √r — 16:9 에서 1.33배다.
 */
const MAX_PIXELS =
  Math.max(...ALL_SLOTS.map((slot) => slot.width)) *
  Math.max(...ALL_SLOTS.map((slot) => slot.height));

/** 촬영본과 같은 인코딩(JPEG 0.92)을 쓴다 — 뒤 단계가 둘을 구분하지 않게. */
const JPEG_QUALITY = 0.92;

export type PhotoImportOptions = {
  /**
   * 변환할 최대 장수. **지원 형식만 남긴 뒤에** 자른다.
   *
   * 고른 순서대로 먼저 자르면 못 읽는 파일이 앞에 몰린 선택에서 쓸 수 있는 사진이 통째로
   * 밀려난다(28장 중 앞 24장이 그런 파일이면 남는 것이 0장이었다). 자르는 자리는 그래도
   * 디코딩 앞이라 상한이 막으려던 비용은 그대로 막는다.
   */
  limit?: number;
};

export type PhotoImportResult = {
  /** 촬영본과 같은 형태의 data URL 목록. */
  dataUrls: string[];
  /** 형식이 안 맞거나 읽지 못해 건너뛴 파일이 있으면 사용자에게 보여 줄 문구. */
  notice: string | null;
  /**
   * 상한 때문에 변환하지 않은 장수.
   *
   * 문구는 여기서 만들지 않는다 — 상한이 왜 있는지(세션에 몇 장까지 담는지)는 화면이 안다.
   */
  overLimitCount: number;
};

/**
 * 백엔드가 받는 형식이거나, **바꿔서 보낼 수 있는** 형식인가.
 *
 * 아이폰 기본 설정이 만드는 HEIC 는 백엔드가 안 받지만 여기서 JPEG 로 구워 보내면 된다
 * (`lib/imageDecode.ts`). 그래서 「지금 그대로 올릴 수 있는가」와 「고쳐서 올릴 수 있는가」를
 * 나눠 본다 — 예전에는 앞의 것만 봐서 아이폰 갤러리 사진이 통째로 걸러졌다.
 *
 * HEIF 판정은 **MIME 이 아니라 바이트**로 한다. 안드로이드 파일 선택기는 HEIC 에
 * `application/octet-stream` 을 주거나 아예 빈 문자열을 준다 — MIME 을 믿으면 그 파일들이
 * 여기서 잘려 변환 경로에 닿지도 못한다.
 */
async function canImportPhoto(file: File): Promise<boolean> {
  if (canUploadAsIs(file)) return true;

  /*
    브라우저가 스스로 읽을 수 있는 형식은 통과시킨다 — AVIF 가 그렇다(크롬 85+·사파리
    16.4+). 읽어서 캔버스에 그리면 나가는 것은 어차피 JPEG 이므로 서버 계약과 무관하다.
    못 읽으면 아래 `decodeImageFile` 이 null 을 주고 「읽지 못했어요」로 세어진다.

    동영상을 여기서 막는 것이 이 줄의 일이다. `video/mp4` 는 디코드해 봐야 실패하는데,
    그때 뜨는 문구가 「읽지 못했어요」라 사용자가 무엇이 잘못됐는지 모른다.
  */
  if (file.type.startsWith("image/")) return true;

  // 앞 12 바이트면 브랜드까지 읽힌다. 파일 전체를 메모리에 올리지 않는다.
  // MIME 이 비어 오는 경우(안드로이드 파일 선택기의 HEIC)가 여기로 온다.
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());

    return looksLikeHeif(head);
  } catch {
    /*
      바이트를 못 읽는 파일(아직 안 내려받은 클라우드 보관물)이 여기서 던지면
      `Promise.all` 이 통째로 거절돼 같이 고른 사진까지 전부 잃는다. 통과시켜
      아래 `decodeImageFile` 이 그 한 장만 「읽지 못했어요」로 세게 한다.
      여기서 false 를 주면 「지원하지 않는 형식」으로 세어져 문구가 거짓이 된다.
    */
    return true;
  }
}

function toScaledDataUrl(image: {
  source: CanvasImageSource;
  width: number;
  height: number;
}): string | null {
  const { width, height } = image;
  if (!width || !height) return null;

  const scale = Math.min(
    /*
      **없는 화소를 만들지 않는다** — 여기서 늘리면 합성이 늘리는 것과 결과가 같고 무겁기만
      하다. 그 1 상한을 여기 따로 적지 않는 이유는 `fitCanvasScale` 이 이미 1 이하만
      돌려주기 때문이다(canvasBudget.ts — 두 배율 다 그 자리에서 1 로 막는다).
      한 번 더 적으면 어느 쪽이 막고 있는지 아무도 모르게 된다.
    */
    // 화소 예산(위 `MAX_PIXELS`). 비율을 그대로 두므로 두 변에 √ 로 나뉜다.
    Math.sqrt(MAX_PIXELS / (width * height)),
    /*
      캔버스 한 장이 커도 되는 선. **긴 변 상한이 없어졌으므로** 이것이 필요하다 —
      파노라마(예: 25344×2048)는 넓이 예산을 통과하면서 한 변이 1만 px 을 넘는 캔버스를
      만든다. 그 선의 주인은 `lib/canvas/canvasBudget.ts` 하나다(숫자를 여기 다시 박으면
      한쪽만 고쳐지고, 그때 갈라지는 쪽이 「조용히 빈 캔버스」 경로다).
      HEIC 경로는 `decodeWithLibheif` 가 이미 같은 배율을 걸어 두어 여기서는 1 이 나온다.
    */
    fitCanvasScale(width, height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/**
 * 고른 파일들을 촬영본과 같은 data URL 로 바꾼다.
 *
 * **HEIC 는 여기서 JPEG 로 바꿔 준다**(`lib/imageDecode.ts`) — 아이폰 기본 설정이 만드는
 * 형식이라 걸러 내면 아이폰 갤러리 사진이 통째로 막힌다. 그래도 못 읽는 형식(avif·mp4 등)은
 * 걸러 낸다. 그대로 통과시키면 사진을 다 고른 뒤 **합성 단계에서야** 실패해서, 되돌리기
 * 가장 비싼 자리에서 문제를 만난다. 읽지 못한 파일도 같은 이유로 여기서 걸러 개수를 알린다.
 *
 * `limit` 을 주면 개수 상한도 여기서 건다. 형식을 아는 곳이 한 곳뿐이어야
 * "거른 뒤에 자른다"는 순서가 지켜진다.
 */
export async function importPhotoFiles(
  files: File[],
  { limit }: PhotoImportOptions = {},
): Promise<PhotoImportResult> {
  /*
    바이트를 읽어야 해서 비동기다. `filter` 로는 못 하므로 판정을 먼저 모아 놓고 거른다.
    12 바이트씩이라 장수가 많아도 값이 싸다.
  */
  const verdicts = await Promise.all(files.map((file) => canImportPhoto(file)));
  const supported = files.filter((_, index) => verdicts[index]);
  const unsupportedCount = files.length - supported.length;

  const dataUrls: string[] = [];
  let unreadableCount = 0;
  let attempted = 0;

  /*
    상한은 **성공한 장수**로 센다. 「앞에서부터 limit 장을 잘라서 그것만 시도」가 아니다.

    싸게 거를 수 있는 것(동영상, 이미지가 아닌 것)은 위에서 이미 걸렀지만, 남은 것 중에도
    열어 봐야 아는 실패가 있다 — 깨진 파일, 우리가 못 푸는 형식. 그걸 먼저 잘라 두면 그
    실패들이 상한 자리를 먹고 뒤의 멀쩡한 사진이 통째로 밀려난다(28장 중 앞 24장이 그런
    파일이면 남는 것이 0장이었다 — 8-28 에 실제로 그랬다).

    비용은 예전과 같은 자리에 있다. 성공하면 그 즉시 멈추므로 정상적인 선택에서는 딱
    `limit` 장만 푼다. 실패가 있을 때만 그만큼 더 열어 보는데, 그것이 바로 사용자가
    구제받는 경우다.
  */
  for (const file of supported) {
    if (limit != null && dataUrls.length >= Math.max(0, limit)) break;

    attempted += 1;
    const image = await decodeImageFile(file);
    const dataUrl = image ? toScaledDataUrl(image) : null;
    if (dataUrl) dataUrls.push(dataUrl);
    else unreadableCount += 1;
  }

  // 상한을 채워서 **열어 보지도 않은** 장수. 문구는 화면이 만든다(위 타입 주석 참고).
  const overLimitCount = supported.length - attempted;

  const notices: string[] = [];
  if (unsupportedCount > 0) {
    notices.push(
      `${unsupportedCount}장은 지원하지 않는 형식이라 제외했어요. ${UNSUPPORTED_UPLOAD_MESSAGE}`,
    );
  }
  if (unreadableCount > 0) {
    notices.push(`${unreadableCount}장은 읽지 못해 제외했어요.`);
  }

  return { dataUrls, notice: notices.join(" ") || null, overLimitCount };
}
