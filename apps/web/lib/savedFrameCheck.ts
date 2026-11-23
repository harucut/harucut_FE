import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import { toThemeExportJson } from "@/lib/frameApi";
import { resolveThemeAssetUrls } from "@/lib/frameAssets";
import { freeCellsEnabled } from "@/lib/frameCells";
import { getImageUrlByKey } from "@/lib/presignedUploadApi";
import { getFrame } from "@/lib/remoteFrameApi";
import type { RemoteFrame } from "@/lib/api-types";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

/** 그림 하나를 이만큼 기다린다. 넘기면 못 읽은 것으로 친다 — 확인 중에는 찍기 단추가 잠겨 있다. */
const ASSET_TIMEOUT_MS = 15_000;

/**
 * 확인 전체(프레임 조회·주소 받기·그림 열기)를 이만큼 기다린다. 프레임 조회나 주소 요청이 응답 없이 멈추면 그림
 * 상한(위)까지 가지도 못해 찍기 단추가 「확인 중…」으로 영영 잠겼다(Codex 리뷰 #604). 넘기면 다시 누르게 한다.
 * 실측이 아니다 — 안 끝나면 사용자가 갇히는 곳에 이미 건 상한(lib/authSession.ts 의 STATUS_DEADLINE_MS 등)과 맞췄다.
 */
export const SAVED_FRAME_CHECK_TIMEOUT_MS = 30_000;
const CHECK_FAILED = "프레임을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.";

/**
 * 저장한(꾸민) 프레임을 그릴 수 있는 모양으로 — 배경 그림과 스티커의 주소를 붙인다.
 * 배경 IMAGE 와 컴포넌트 자산은 key 로만 저장돼 있다. 주소를 못 받으면 비워 둔다(그리는 쪽은 색으로 폴백한다).
 */
export async function themeWithAssetUrls(frame: RemoteFrame): Promise<ThemeExportJson> {
  const theme = toThemeExportJson(frame);
  if (theme.background?.type === "IMAGE" && theme.background.key && !theme.background.url) {
    const url = await getImageUrlByKey(theme.background.key);
    if (url) theme.background = { ...theme.background, url };
  }
  return resolveThemeAssetUrls(theme);
}

function loadImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error("frame asset timed out")), ASSET_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("frame asset failed"));
    };
    // 서명 URL 이 Referer 로 새지 않게 한다(기록 사진 보기와 같다).
    image.referrerPolicy = "no-referrer";
    image.src = url;
  });
}

/**
 * 저장한 프레임으로 **찍기 전에** 쓸 수 있는지 본다(2026-11-15 「프레임에 문제가 있던 거면 촬영 전에부터
 * 말해주는 게 맞지 않을까?」). 문제가 없으면 null, 있으면 화면에 그대로 띄울 문장.
 *
 * 예전에는 사진을 다 찍고 고른 뒤 합성에서야 알았다 — 지워진 프레임(GEN-031·404), 아직 못 쓰는 자유 칸
 * 프레임(FRAME-008), 요금제(SUBS·403), 배경·스티커 파일이 없거나 깨진 프레임(ASSET_*). 앞의 셋은 프레임을
 * 읽어 보면 알고, 마지막은 서버 합성이 쓰는 그 파일을 브라우저로 열어 보면 안다(같은 저장소의 같은 객체).
 * 서버만 못 읽는 경우(GEN-002·003)는 여기서 다 거르지 못한다 — 그때는 완성 화면이 프레임을 다시 고르게 한다.
 */
export function checkSavedFrame(remoteFrameId: number): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(CHECK_FAILED), SAVED_FRAME_CHECK_TIMEOUT_MS);
  });
  return Promise.race([inspectSavedFrame(remoteFrameId), deadline]).finally(() => clearTimeout(timer));
}

async function inspectSavedFrame(remoteFrameId: number): Promise<string | null> {
  let frame: RemoteFrame;
  try {
    frame = await getFrame(remoteFrameId);
  } catch (error) {
    const { code, status } = getApiErrorDetails(error);
    if (code === "GEN-031" || status === 404) return "고른 프레임을 찾을 수 없어요. 다른 프레임을 골라 주세요.";
    if (code?.startsWith("SUBS-") || status === 403) {
      return getUserFacingApiErrorMessage(error, "지금 요금제로는 이 프레임을 쓸 수 없어요.");
    }
    return CHECK_FAILED;
  }

  if (frame.cells?.length && !freeCellsEnabled()) return "이 프레임은 아직 촬영에 쓸 수 없어요. 곧 열릴 예정이에요.";

  let theme: ThemeExportJson;
  try {
    theme = await themeWithAssetUrls(frame);
  } catch (error) {
    console.error(error);
    return CHECK_FAILED;
  }

  /*
    서버는 저장소 key 만 읽는다(lib/types/themeEditor.ts 의 source·renderedKey). 사진·스티커가 key 도 공통 자산도
    아니거나, 글자를 구운 층이 없으면 합성이 400 GEN-002 로 거부된다 — 프레임을 다시 저장해야 풀린다.
  */
  const unreadable = theme.components.some((component) =>
    component.type === "TEXT"
      ? !component.renderedKey && !component.renderedAssetId
      : !component.assetId && !component.source.startsWith("uploads/"),
  );
  if (unreadable) return "프레임에 넣은 스티커나 글자를 쓸 수 없어요. 프레임 꾸미기에서 다시 저장한 뒤 골라 주세요.";

  try {
    const urls: string[] = [];
    if (theme.background?.type === "IMAGE") {
      if (!theme.background.url) throw new Error("frame background has no url");
      urls.push(theme.background.url);
    }
    // 테마의 컴포넌트는 응답과 같은 순서다(toThemeExportJson). 글자 층의 조회 주소는 응답에만 있다.
    for (const [index, component] of theme.components.entries()) {
      if (component.type === "TEXT") {
        // 서버가 쓰는 것은 구운 글자 층이다 — 그 파일이 열리는지 본다.
        if (!component.renderedKey) continue;
        const url = frame.components[index]?.renderedUrl ?? (await getImageUrlByKey(component.renderedKey));
        if (!url) throw new Error("frame text layer has no url");
        urls.push(url);
        continue;
      }
      if (!component.renderUrl) throw new Error("frame asset has no url");
      urls.push(component.renderUrl);
    }
    await Promise.all([...new Set(urls)].map(loadImage));
  } catch (error) {
    console.error(error);
    return "프레임 그림을 불러오지 못했어요. 다시 누르거나 다른 프레임을 골라 주세요.";
  }
  return null;
}
