"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GUEST_ALLOWED_ITEMS,
  GUEST_MEMBER_ONLY_ITEMS,
  withJosa,
} from "@harucut/shared";
import { GeneratedAssetDownloadCard } from "@/components/frame/GeneratedAssetDownloadCard";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import type { FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  composeFramePng,
  downloadBlob,
  downloadFromUrl,
  type FrameSource,
} from "@/lib/canvas/composeFrame";
import {
  buildDefaultDisplayName,
  buildDownloadFilename,
  sanitizeDisplayName,
  FOURCUT_OUTPUT_EXTENSION,
  type GeneratedFourcutAsset,
} from "@/lib/fourcutOutput";
import { describeComposeFailure } from "@/lib/fourcutCompose";
import { saveFourcutToServer } from "@/lib/fourcutProcessing";
import {
  registerGeneratedPngDebug,
  unregisterGeneratedPngDebug,
} from "@/lib/generatedImageDebug";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { isNotNull } from "@/lib/guards";
import { setPendingGuestSave } from "@/lib/pendingGuestSave";
import { buildPathWithRedirect } from "@/lib/redirect";
import { getNativeSaveErrorMessage, nativeNotify } from "@/lib/nativeBridge";
import { isCopyFailedError, shareOrCopyLink } from "@/lib/share";
import { useShootSession } from "@/lib/shootSessionStore";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { updateMediaDisplayName, getMediaDownloadUrl } from "@/lib/userMediaApi";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";

const IMAGE_DEBUG_SCOPE = "shoot-result-image";

// 비회원이 로그인으로 넘어갈 때 쓰는 경로. 로그인 후 /home에서 보관해 둔 결과물을 자동 저장한다.
const GUEST_LOGIN_HANDOFF_PATH = buildPathWithRedirect(
  "/login",
  "/home?resumeSave=1",
);

type ProcessingState = "idle" | "processing" | "done" | "error";

/*
  ── 완성 알림은 이 화면의 수명 밖에 있다 ──

  마이페이지는 「앱을 켜 둔 채 다른 화면을 보고 있으면 다 됐을 때 알려드려요」라고 안내한다
  (components/mobile/NativeNotificationSetting.tsx). 그 사람은 결과 화면을 떠난 사람이라,
  판정에 필요한 값을 컴포넌트가 들고 있으면 안 된다 — 마운트와 함께 사라진다. 그래서
  아래 둘은 모듈에 둔다.
*/

/**
 * 결과 화면이 지금 떠 있는 수.
 *
 * "결과가 눈앞에 있는가"는 어느 한 인스턴스의 마운트 여부로는 알 수 없다. 화면을 나갔다
 * 들어오면 앞 실행의 약속(cancelled)은 그대로 살아 있는데 결과는 새 인스턴스가 보여 주고
 * 있다 — 그때 앞 실행이 "안 보고 있다"고 판단해 알리면 보고 있는 사람에게 알림이 뜬다.
 */
let mountedResultPages = 0;

/**
 * 이 탭이 **마지막으로 기다리는** 서버 합성과, 그 완료를 이미 알렸는지.
 *
 * 한 합성의 완료를 기다리는 실행이 여럿일 수 있다 — 늦게 도착한 테마로 effect 가 다시 돌면
 * 새 실행이 같은 약속을 이어받고(pendingServerComposeRef), 화면을 나갔다 들어오면 같은
 * 멱등키로 한 번 더 접수한다. 마지막 것 하나만, 한 번만 알린다: 앞선 것까지 알리면 알림이
 * 두 번 뜨고, 사진·색·프레임을 바꿔 새 합성이 시작된 경우에는 **사용자가 버린 합성**까지
 * "완성됐어요"가 된다.
 *
 * **같은 작업인지는 멱등키로 본다 — Promise 객체로 보지 않는다.** `pendingServerComposeRef`
 * 는 컴포넌트 ref 라 화면을 나갔다 들어오면 비어 있고, 그때 같은 멱등키로 접수해도 Promise
 * 는 새것이다. 객체로 대조하면 그 순간 앞 실행이 「최신이 아니다」로 밀려, 재진입 요청이
 * 네트워크 오류로 실패하고 **앞 요청만 성공한** 경우에 아무도 알리지 않는다. 멱등키는 같은
 * 작업이면 같고(위 ensureComposeIdempotencyKey), 사진·색·프레임이 바뀌면 달라진다 —
 * 「버린 합성은 알리지 않는다」도 그대로 지켜진다.
 */
let latestServerCompose: {
  idempotencyKey: string;
  notified: boolean;
} | null = null;

/**
 * 서버 합성이 끝났다고 알린다. **결과가 눈앞에 없을 때만** 알린다 — 보고 있으면 그냥 보인다.
 *
 * 덮는 것은 둘이다. ① 앱 셸 안에서 다른 화면으로 옮겨 간 때(결과 화면이 마운트돼 있지 않다)
 * ② 문서만 hidden 이고 JS 는 아직 도는 때(안드로이드 WebView 가 대표적이다).
 *
 * ⚠️ **앱을 완전히 벗어난 경우는 이걸로 못 덮는다.** 앱이 백그라운드로 가면 OS 가 WebView 의
 * 자바스크립트를 멈춰서 폴링도 이 함수도 돌지 않고, 돌아왔을 때는 이미 visible 이다.
 * 브라우저 탭도 아니다 — 셸 밖에서는 nativeNotify 가 그 자리에서 null 을 돌려주고 아무 일도
 * 하지 않는다(lib/nativeBridge.ts 의 isNativeShell 검사).
 *
 * 앱을 벗어난 사이의 알림은 서버가 보내야 한다 — 기기 토큰 등록 엔드포인트가 필요하고,
 * docs/app-shell-backend-requests.md 3번에 적어 뒀다.
 *
 * 미리 예약(secondsFromNow)해 두는 것으로 때우지 않는다. 지금 브리지에는 **취소 메시지가
 * 없어서**, 합성이 실패했거나 사용자가 화면을 보고 있어도 "완성됐어요"가 뜬다.
 */
/**
 * 이 합성은 **결과를 눈으로 본 것으로** 친다. 나중에 끝나는 같은 작업은 알리지 않는다.
 *
 * 같은 멱등키를 기다리는 실행이 둘일 수 있다(나갔다 들어오면 새 인스턴스가 같은 키로 한 번
 * 더 접수한다). 그중 빠른 쪽이 **화면에 결과를 그렸다면** 사용자는 이미 봤다. 그런데 그때는
 * 화면이 보이는 중이라 `notifyServerComposeDone` 이 「알릴 필요 없음」으로 그냥 돌아가고,
 * `notified` 는 false 로 남는다. 그 뒤 사용자가 화면을 떠나고 느린 쪽이 끝나면 조건이 전부
 * 맞아떨어져 **이미 본 결과에 대한 완성 알림**이 뒤늦게 뜬다.
 *
 * 그래서 「알렸다」와 「보여 줬다」를 같은 자리에 기록한다. 둘 다 이 합성에 대해 사용자에게
 * 할 일이 끝났다는 뜻이다.
 *
 * 부르는 자리는 **결과를 실제로 그린 실행 하나뿐**이다(`cancelled` 가 아닌 쪽). 떠난 화면
 * 뒤에서 조용히 끝난 실행은 아무것도 보여 주지 않았으므로 여기 오지 않는다 — 그것까지
 * 여기서 접으면 「화면을 떠난 사람에게 알린다」가 통째로 죽는다.
 *
 * 그리고 **문서가 가려져 있으면 그린 것도 본 것이 아니다.** 그 경우는 알림이 제 몫을 하는
 * 자리라 여기서 접지 않는다(안드로이드 WebView 가 대표적이다 — 아래 notifyServerComposeDone).
 */
function markServerComposeSeen(idempotencyKey: string) {
  if (document.visibilityState !== "visible") return;
  if (latestServerCompose?.idempotencyKey !== idempotencyKey) return;
  latestServerCompose.notified = true;
}

function notifyServerComposeDone(idempotencyKey: string) {
  if (mountedResultPages > 0 && document.visibilityState === "visible") return;
  if (
    latestServerCompose?.idempotencyKey !== idempotencyKey ||
    latestServerCompose.notified
  )
    return;

  latestServerCompose.notified = true;
  void nativeNotify({
    title: "네컷이 완성됐어요",
    /*
      **눌러서 갈 곳을 약속하지 않는다.**

      본문은 「눌러서 보러 가기」였는데, 눌러도 가지지 않는다 — 셸에 알림 응답 리스너가
      없고(`apps/mobile/app/_layout.tsx`: "딥링크를 실제로 쓰게 되면 여기에 핸들러가
      붙는다"), 브리지에도 앱이 웹에 경로를 넘길 메시지가 없다. 탭하면 앱이 앞으로 올 뿐
      보고 있던 화면 그대로다. 그래서 실제로 되는 것만 적는다.

      탭 이동을 붙이려면 셸의 알림 응답 처리와 브리지 양쪽(웹↔앱)이 같이 필요하다 —
      docs/mobile-shell.md 「알림을 눌렀을 때」에 무엇이 없는지 적어 뒀다.
    */
    body: "기록 화면에서 볼 수 있어요",
  });
}

export default function ShootResultPage() {
  const router = useRouter();
  const {
    frameId,
    remoteFrameId,
    shots,
    selectedIndexes,
    borderColor,
    outputFilter,
    imageResult,
    setImageResult,
    ensureComposeIdempotencyKey,
    clearResults,
    eventName,
    source,
  } = useShootSession();
  // 갤러리에서 온 사진이면 "다시 촬영"이라고 말하면 안 된다 — 찍은 적이 없다.
  const fromUpload = source === "upload";
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const hydrated = useGuestTrialStore((state) => state.hydrated);
  const setNotice = useGuestTrialStore((state) => state.setNotice);
  const showGuestSavedNotice = useGuestTrialStore((state) => state.showGuestSavedNotice);
  const showGuestShareNotice = useGuestTrialStore((state) => state.showGuestShareNotice);
  const showGuestRestrictedNotice = useGuestTrialStore(
    (state) => state.showGuestRestrictedNotice,
  );
  const guestMode = accessMode === "guest";
  const [imageState, setImageState] = useState<ProcessingState>(
    imageResult ? "done" : "idle",
  );
  const [imageError, setImageError] = useState<string | null>(null);
  // 다시 시도해서 달라질 수 있는 실패인지. 없는 프레임이나 서버가 못 읽는 스티커처럼
  // 몇 번을 눌러도 같은 결과인 실패에서는 재시도 버튼을 감춘다.
  const [isImageErrorRetryable, setIsImageErrorRetryable] = useState(true);
  // 재시도 버튼이 실제로 다시 돌게 하는 값.
  // 실패했을 때 imageResult 는 이미 null 이라, 이 값을 안 바꾸면 아래 effect 의
  // 의존성이 하나도 안 변해 effect 가 다시 돌지 않는다 — 버튼을 눌러도 "대기 중"에서 멈췄다.
  const [retryNonce, setRetryNonce] = useState(0);
  const [imageNameDraft, setImageNameDraft] = useState(imageResult?.displayName ?? "");
  const [isSavingImageName, setIsSavingImageName] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [isHandingOffToLogin, setIsHandingOffToLogin] = useState(false);
  // 완성본 주소가 열리지 않는가(만료된 조회 URL·오프라인). 참이면 미리보기로 되돌아간다.
  const [isResultImageBroken, setIsResultImageBroken] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugImageUrlRef = useRef<string | null>(null);
  const guestImageUrlRef = useRef<string | null>(null);
  const imageGenerationKeyRef = useRef<string | null>(null);
  /*
    진행 중인 **서버 합성**. 같은 실행 키로 effect 가 다시 돌면 새로 시작하지 않고 이걸 이어받는다.
    왜 이어받아야 하는지는 아래 호출부 주석에 적어 뒀다.
  */
  const pendingServerComposeRef = useRef<{
    key: string;
    run: Promise<GeneratedFourcutAsset>;
  } | null>(null);

  const showStatusNotice = (title: string, message: string) => {
    setNotice({
      actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
      eyebrow: guestMode ? "GUEST MODE" : "NOTICE",
      icon: guestMode ? "lock" : "sparkles",
      message,
      title,
    });
  };

  const selectedCount = useMemo(
    () => selectedIndexes.filter((index) => index != null).length,
    [selectedIndexes],
  );

  const selectedShots = useMemo(
    () => selectedIndexes.map((index) => (index == null ? null : shots[index] ?? null)),
    [selectedIndexes, shots],
  );
  // 원본 4장으로 만드는 **구도 미리보기**. 완성 전(과 완성본을 못 불러왔을 때)만 쓴다 —
  // 저장본에는 누끼와 서버가 그린 장식이 더 들어간다(아래 결과 영역 주석 참고).
  const previewImage = useMemo(
    () => selectedShots.map((photo): FrameMedia | null => (photo ? { src: photo } : null)),
    [selectedShots],
  );
  const imageSources: FrameSource[] = useMemo(
    () =>
      selectedShots
        .map((photo) => (photo ? { src: photo } : null))
        .filter(isNotNull),
    [selectedShots],
  );

  useEffect(() => {
    if (!frameId) {
      router.replace("/shoot");
      return;
    }

    if (!shots.length || selectedCount !== 4 || imageSources.length !== 4) {
      router.replace("/shoot/select");
    }
  }, [frameId, imageSources.length, router, selectedCount, shots.length]);

  // 고른 색이 곧 저장본의 색이다 — 회원 경로는 이 값을 합성 요청에 실어 보내고,
  // 비회원 경로는 브라우저가 이 색으로 그린다. 꾸민 프레임이면 프레임에 저장된 배경이
  // 우선한다(resolveFrameBackgroundColor 가 themeData 를 먼저 본다).
  const effectiveBorderColor = resolveFrameBackgroundColor(themeData, borderColor);
  const layout = frameId ? FRAME_LAYOUTS[frameId as FrameId] : null;
  /*
    색이 결과물을 바꾸는가.

    - 비회원: 브라우저가 그리므로 고른 색이 그대로 그림이 된다 → 바꾼다.
    - 회원 + 기본 프레임: 합성 요청에 색을 실어 보낸다 → 바꾼다.
    - 회원 + 꾸민 프레임: 서버가 **프레임에 저장된 배경**을 쓴다(색을 보내지 않는다) → 안 바꾼다.

    마지막 경우가 중요하다. 꾸민 프레임의 배경은 `useRemoteFrameTheme` 이 **나중에** 읽어 와서
    `effectiveBorderColor` 를 한 번 바꾼다. 그 값이 아래 키에 들어 있으면 진행 중이던 합성이
    통째로 버려지고 새 멱등키로 다시 돈다 — 같은 네컷이 두 벌 남는다.
  */
  const colorAffectsOutput = guestMode || remoteFrameId == null;

  /*
    "이 입력으로 한 번만 만든다"를 가리키는 키.

    **결과를 바꾸지 않는 값은 넣지 않는다.** 넣으면 값이 늦게 도착할 때마다 진행 중인 작업이
    취소되고 다시 시작한다. (2026-08-24 에 실제로 보관함에 같은 이름의 mediaId 두 개가 남았다.)
    반대로 결과를 바꾸는 값을 빼면, 서버가 같은 멱등키로 온 요청을 기존 작업으로 재생해서
    사용자가 색을 바꿔도 예전 그림이 그대로 나온다. 둘 다 조용히 틀리므로 기준을 위에 적어 뒀다.

    재시도용 nonce 도 넣지 않는다 — 결과를 바꾸는 값이 아니다(아래 runKey 참고).

    **프레임 내용도 여기 넣지 않는다.** 내용(themeData)은 늦게 도착하는 값이라 여기 들어가면
    위의 첫 번째 함정을 그대로 밟는다. 대신 아래 effect 가 세션에 내용을 통째로 넘겨
    멱등키에서만 따진다 — 모르는 동안은 키를 흔들지 않고, 알고 나서 달라졌을 때만 새 키가
    나간다(lib/shootSessionStore.ts).
  */
  const generationKey = useMemo(
    () =>
      JSON.stringify({
        frameId,
        remoteFrameId,
        borderColor: colorAffectsOutput ? effectiveBorderColor : null,
        outputFilter,
        imageSources: imageSources.map((source) => source.src),
      }),
    [
      colorAffectsOutput,
      effectiveBorderColor,
      frameId,
      imageSources,
      outputFilter,
      remoteFrameId,
    ],
  );

  /*
    effect 를 다시 돌리기 위한 키. **generationKey 와 분리한다.**

    재시도는 같은 입력으로 같은 작업을 다시 가리키는 것이라 멱등키가 그대로여야 한다.
    이 nonce 가 generationKey 에 들어 있으면 재시도마다 새 멱등키가 잡히고, 서버는
    기존 작업을 재생하는 대신 새로 그린다 — 합성은 이미 끝났는데 그 뒤 다운로드 주소
    조회가 실패하거나 폴링이 시간을 넘긴 경우(둘 다 재시도 가능한 오류로 뜬다),
    같은 네컷이 보관함에 두 벌 남는다.
  */
  const runKey = `${generationKey}#${retryNonce}`;

  // 합성 입력(generationKey)이 바뀔 때마다 기본 파일명을 새로 만든다.
  // buildDefaultDisplayName()은 시각 기반이라 인자가 없고, 호출할 때마다 값이 달라진다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaultDisplayName = useMemo(() => buildDefaultDisplayName(), [generationKey]);

  // 합성 결과가 바뀌면 상태를 렌더 중에 맞춘다(effect로 하면 렌더가 한 번 더 돈다).
  const [syncedImageResult, setSyncedImageResult] = useState(imageResult);
  if (syncedImageResult !== imageResult) {
    setSyncedImageResult(imageResult);
    setImageState(imageResult ? "done" : "idle");
    setImageNameDraft(imageResult?.displayName ?? "");
    // 새 결과는 다시 불러 본다 — 앞 결과가 못 열렸다고 이것까지 접어 두면 안 된다.
    setIsResultImageBroken(false);
  }

  /*
    완성본을 화면에 띄울 주소. 못 불러오면 null 로 떨어져 아래 미리보기로 되돌아간다.

    회원 경로의 주소는 만료되는 조회 URL 이고(lib/fourcutProcessing.ts), 비회원 경로는
    메모리 blob 이라 새로고침 한 번에 죽는다. 둘 다 빈 사각형을 남기느니 원본 미리보기라도
    보여 주는 편이 낫다.
  */
  const resultImageSrc = isResultImageBroken
    ? null
    : imageResult?.objectUrl ?? null;

  // 완성 알림이 "결과가 눈앞에 있는가"를 인스턴스 너머로 볼 수 있게 마운트를 센다
  // (위 mountedResultPages). 아래 합성 effect 보다 먼저 세워 둔다.
  useEffect(() => {
    mountedResultPages += 1;
    return () => {
      mountedResultPages -= 1;
    };
  }, []);

  useEffect(() => {
    if (!frameId || !layout || selectedCount !== 4 || imageSources.length !== 4) return;

    /*
      **쿠키를 읽기 전에는 어느 쪽으로도 그리지 않는다.**

      accessMode 의 초깃값은 "member" 라, hydrateGuestMode() 가 반영되기 전에는 진짜
      비회원도 회원으로 읽힌다. 그 값으로 아래 분기를 타면 비회원이 인증 전용 서버 합성을
      불러 401 을 맞는다. 반대로 초깃값을 게스트로 넘겨짚어도 안 된다 — 브라우저가 그린
      그림이 imageResult 에 박히면 회원인데도 기록에 아무것도 남지 않는다.
      그래서 넘겨짚지 않고 **기다린다**(hydrated 가 참이 되면 effect 가 다시 돈다).
    */
    if (!hydrated) return;

    let cancelled = false;
    /** 이 실행이 결과(성공이든 실패든)를 남겼는가. 아래 cleanup 이 쓴다. */
    let settled = false;
    const currentLayout = layout;

    /*
      이번 실행이 쓸 멱등키를 **결과를 확인하기 전에** 확정한다.

      `remoteFrameId` 는 프레임 내용을 고쳐도 그대로다(수정은 같은 id 로 가는 PUT 이다).
      그래서 내용이 바뀌었는지는 세션이 프레임 지문으로 따진다(lib/shootSessionStore.ts).
      바뀌었으면 여기서 새 키가 잡히면서 `imageResult` 까지 버려진다 — 그래야 아래
      `if (imageResult) return` 을 통과해 다시 합성한다. 늦게 도착한 테마를 합성 뒤에
      확인하면 화면에는 이미 수정 전 그림이 박힌 뒤라 아무도 그것을 걷어내지 못한다.

      게스트는 브라우저가 그리므로 서버 멱등키가 없다(빈 문자열).
    */
    const composeKey = guestMode
      ? ""
      : ensureComposeIdempotencyKey(generationKey, themeData);

    /*
      "이 실행은 이미 했다"를 가리키는 값. **멱등키를 함께 넣는다** — 프레임을 고쳐 키가
      새로 잡히면 이 값도 달라져야, 아래 검사를 통과해 다시 합성한다.
    */
    const imageGenerationKey = `${runKey}#${composeKey}:image`;

    async function prepareOutputs() {
      if (imageResult) return;
      if (imageGenerationKeyRef.current === imageGenerationKey) return;

      imageGenerationKeyRef.current = imageGenerationKey;
      setImageError(null);
      setIsImageErrorRetryable(true);
      setImageState("processing");

      const displayName = defaultDisplayName;

      try {
        if (guestMode) {
          // 비회원은 보관함을 쓸 수 없어서, 브라우저가 그린 그림이 곧 결과물이다.
          const blob = await composeFramePng({
            layout: currentLayout,
            borderColor: effectiveBorderColor,
            sources: imageSources,
            outputFilter,
            theme: themeData,
            canvas: canvasRef.current ?? undefined,
          });

          if (cancelled) return;

          debugImageUrlRef.current = registerGeneratedPngDebug({
            scope: IMAGE_DEBUG_SCOPE,
            blob,
            filename: `${displayName}.png`,
            previousUrl: debugImageUrlRef.current,
          });

          const objectUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }

          if (guestImageUrlRef.current?.startsWith("blob:")) {
            URL.revokeObjectURL(guestImageUrlRef.current);
          }

          guestImageUrlRef.current = objectUrl;
          settled = true;
          setImageResult({
            mediaId: -1,
            objectUrl,
            downloadUrl: objectUrl,
            displayName,
          });
          setImageState("done");
          return;
        }

        // 로그인 사용자는 **서버가 그린다.** 화면 미리보기는 아래 <FramePreview> 가
        // DOM 으로 그리므로 여기서 캔버스 합성을 할 이유가 없다.
        //
        // 예전에는 회원 경로에서도 위 composeFramePng 을 먼저 돌렸는데, 그 결과를 쓰는 곳이
        // 개발자용 디버그 전역 하나뿐이었다. 최대 16MP 캔버스 합성과 PNG 인코딩을 매번
        // 헛돌리며 서버 합성 시작을 그만큼 늦췄고, 더 나쁘게는 그 로컬 합성이 실패하면
        // 멀쩡히 성공했을 서버 저장까지 통째로 취소됐다.

        /*
          멱등키는 **세션에서 이어받는다.** 컴포넌트가 들고 있으면 안 된다.

          아래 cleanup 은 `cancelled` 만 세울 뿐 이미 나간 합성을 되돌리지 못한다 —
          결과를 기다리는 중에 '사진 다시 고르기'나 뒤로가기로 화면을 떠나도 서버는 계속
          그려서 보관함에 결과를 남긴다. 그런데 재진입은 이 컴포넌트를 새로 마운트하므로,
          키가 컴포넌트에 있으면 그때마다 새로 잡혀 같은 네컷이 한 벌 더 접수된다
          (앞선 실행의 결과는 `cancelled` 때문에 세션에도 안 남아 막아 주지 못한다).

          재시도 버튼도 같은 이유로 이 키를 그대로 쓴다 — 입력과 프레임 내용이 그대로면
          키도 그대로다. 위에서 이미 확정해 둔 값이라 여기서는 읽기만 한다.
        */
        const idempotencyKey = ensureComposeIdempotencyKey(generationKey, themeData);

        /*
          **같은 실행 키의 합성은 하나뿐이다 — 돌고 있으면 이어받는다.**

          아래 cleanup 이 실행 키를 비우므로, 꾸민 프레임의 테마가 이 합성 도중에 도착하면
          다시 도는 effect 가 "아직 안 했다"고 보고 여기까지 온다. 그때 한 번 더 부르면
          멱등키가 같아도 **원본 4장이 새 S3 키로 다시 올라간다** — 멱등키가 덮는 것은 그
          뒤의 합성 접수뿐이라(lib/fourcutCompose.ts 의 uploadSources 는 그 앞이다), 서버가
          합성을 재생해도 새로 올라간 4장은 아무도 안 쓰는 채 버킷에 남는다. 프론트에는
          지울 방법도 없다.

          이어받아도 결과는 같다 — 이 요청은 `themeData` 를 보지 않는다(꾸민 프레임의 배경과
          누끼는 서버가 `remoteFrameId` 로 읽고, 보낸 색은 버린다). 내용이 진짜 달라졌다면
          위에서 멱등키가 새로 잡히고, 그러면 이 키도 달라져 새 실행이 시작된다.
        */
        const pending = pendingServerComposeRef.current;
        const run =
          pending?.key === imageGenerationKey
            ? pending.run
            : saveFourcutToServer({
                sources: imageSources.map((source) => source.src),
                layout: currentLayout,
                outputFilter,
                frameId: frameId as FrameId,
                remoteFrameId,
                displayName,
                idempotencyKey,
                backgroundColor: effectiveBorderColor,
              });
        pendingServerComposeRef.current = { key: imageGenerationKey, run };
        // 이 탭이 기다리는 합성이 바뀌었으면 알림 대상도 그것으로 옮긴다(위 latestServerCompose).
        // 같은 멱등키면 그대로 둔다 — 재진입해 새 Promise 로 접수해도 같은 작업이다.
        if (latestServerCompose?.idempotencyKey !== idempotencyKey) {
          latestServerCompose = { idempotencyKey, notified: false };
        }

        const asset = await run;

        if (!cancelled) {
          settled = true;
          setImageResult(asset);
          setImageState("done");
          // 사용자에게 결과를 보여 줬다. 같은 작업을 기다리던 느린 실행이 나중에 끝나도
          // 다시 알리지 않는다(위 markServerComposeSeen).
          markServerComposeSeen(idempotencyKey);
        }

        /*
          알림은 **`cancelled` 밖에 둔다.** `cancelled` 는 "떠난 화면에 상태를 쓰지 않는다"는
          뜻이지 "약속한 알림을 접는다"는 뜻이 아니다. 안에 두면 결과를 기다리다 '홈으로
          가기'로 옮겨 간 사람 — 마이페이지가 알려 주겠다고 안내한 바로 그 사람 — 만 알림을
          못 받는다. 누구에게 알릴지는 notifyServerComposeDone 이 판정한다(위).
        */
        notifyServerComposeDone(idempotencyKey);
      } catch (error) {
        console.error(error);
        if (cancelled) return;

        // 실패 사유를 버리지 않는다. 프레임을 바꾸면 되는 실패인지, 기다리면 되는 실패인지
        // 사용자가 알아야 한다(lib/fourcutCompose.ts describeComposeFailure).
        const failure = describeComposeFailure(error);
        settled = true;
        setImageState("error");
        setImageError(failure.message);
        setIsImageErrorRetryable(failure.retryable);
      }
    }

    void prepareOutputs();

    return () => {
      cancelled = true;

      /*
        끝맺지 못하고 끊겼으면 이 키를 "처리했다"고 남겨 두면 안 된다.

        키는 비동기 작업을 **시작하기 전에** 찍힌다. 그래서 작업이 도는 도중 의존성이 바뀌면
        (꾸민 프레임의 테마가 늦게 도착하는 경우가 그렇다) 이 cleanup 이 결과를 버리는데,
        다시 도는 effect 는 같은 키를 보고 "이미 했다"며 그냥 돌아간다.
        아무도 결과를 만들지 않아 화면이 영원히 "처리 중"에 남는다.

        비우는 것은 **effect 를 다시 돌리기 위해서지 합성을 다시 시키기 위해서가 아니다.**
        진행 중인 서버 합성은 위 `pendingServerComposeRef` 가 붙잡고 있어서, 다시 도는
        실행이 그것을 이어받아 결과를 받아 간다 — 원본이 두 번 올라가지 않는다.
      */
      if (!settled && imageGenerationKeyRef.current === imageGenerationKey) {
        imageGenerationKeyRef.current = null;
      }
    };
  }, [
    defaultDisplayName,
    effectiveBorderColor,
    ensureComposeIdempotencyKey,
    frameId,
    generationKey,
    runKey,
    hydrated,
    remoteFrameId,
    guestMode,
    imageResult,
    imageSources,
    layout,
    outputFilter,
    selectedCount,
    setImageResult,
    themeData,
  ]);

  useEffect(() => {
    return () => {
      unregisterGeneratedPngDebug(IMAGE_DEBUG_SCOPE, debugImageUrlRef.current);
      debugImageUrlRef.current = null;
    };
  }, []);

  /*
    촬영본은 메모리에만 있다(lib/shootSessionStore.ts 는 비영속). 새로고침 한 번에 원본
    4장이 사라지고 화면은 /shoot 으로 튕긴다 — 회원도 마찬가지다.

    - 회원: 보관함에 결과가 남는 순간(imageResult)이 안전선이다. 그 전(생성 중·합성 실패)
      에는 경고한다. 실패 화면에서 새로고침하는 것이 가장 흔한 손실 경로다.
    - 비회원: 결과물도 메모리 blob 이라 만들어진 뒤에도 계속 경고한다.

    회원이 합성을 접수시킨 뒤(서버는 계속 그려 보관함에 남긴다) 탭을 닫으면 확인창이 한 번
    헛뜬다. 접수 여부를 화면이 알 수 있는 상태값이 없고, 같은 흐름의 앞 세 단계가 이미
    shots.length > 0 만 보므로(app/shoot/capture·select·upload) 그쪽에 맞춘다.
  */
  useUnsavedWorkGuard(shots.length > 0 && (guestMode || !imageResult));

  if (!frameId || !layout) return null;

  const isPreparing = imageState === "processing" || imageState === "idle";

  const syncDisplayName = async (
    asset: NonNullable<typeof imageResult>,
    nextName: string,
    updateAsset: (displayName: string) => void,
  ) => {
    const sanitizedName = sanitizeDisplayName(nextName, asset.displayName);
    const updated = await updateMediaDisplayName(asset.mediaId, sanitizedName);
    const resolvedName = updated.displayName?.trim() || sanitizedName;

    updateAsset(resolvedName);
    return resolvedName;
  };

  const handleSaveImageName = async () => {
    if (!imageResult) return;

    setIsSavingImageName(true);
    try {
      const nextName = sanitizeDisplayName(imageNameDraft, imageResult.displayName);
      if (nextName === imageResult.displayName) {
        setImageNameDraft(imageResult.displayName);
        return;
      }

      if (guestMode) {
        setImageResult({ ...imageResult, displayName: nextName });
        setImageNameDraft(nextName);
        return;
      }

      const resolvedName = await syncDisplayName(imageResult, imageNameDraft, (displayName) =>
        setImageResult({ ...imageResult, displayName }),
      );
      setImageNameDraft(resolvedName);
    } catch (error) {
      console.error(error);
      showStatusNotice("이름을 저장하지 못했어요", "잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSavingImageName(false);
    }
  };

  /**
   * 로그인 뒤 다시 만들 수 있도록 재료를 보관한다.
   *
   * 완성본이 아니라 원본 4장을 담는다 — 완성본을 등록하는 API 가 없어졌고, 재료가 더 작다.
   * 로그인을 마치면 GuestTrialBridge 가 이걸로 서버 합성을 돌린다.
   *
   * 보관은 IndexedDB 라 비동기다(lib/pendingGuestSave.ts). 여기 두 호출부는 모두 이미
   * 비동기 핸들러 안이라 `await` 로 끝난다.
   */
  const storeGuestHandoff = async () => {
    // 4장이 다 차기 전에는 보관하지 않는다. 보관물은 한 벌이라 못 쓰는 것이 앞서 남긴
    // 온전한 한 벌을 덮어쓰고, 읽는 쪽은 그것을 버리면서 지운다(lib/pendingGuestSave.ts
    // 의 hasFourSources) — 인계가 통째로 사라진다.
    if (!frameId || imageSources.length !== 4) return false;

    return setPendingGuestSave(
      {
        sources: imageSources.map((source) => source.src),
        frameId: frameId as FrameId,
        remoteFrameId,
        outputFilter,
        // 고른 색이 곧 저장본의 색이다 — 로그인 후 재합성에도 같은 색을 실어 보낸다.
        // 빼면 서버가 프레임에 저장된 배경으로 그려, 방금 내려받은 그림과 색이 갈린다.
        // 꾸민 프레임이어도 그대로 넣는다(서버 합성 쪽에서 알아서 버린다).
        backgroundColor: effectiveBorderColor,
        // 사용자가 결과 화면에서 이름을 고쳤으면 그 이름으로 남긴다.
        // 기본값을 쓰면 공들여 붙인 이름이 로그인 직후 조용히 사라진다.
        displayName: imageResult?.displayName?.trim() || defaultDisplayName,
      },
      Date.now(),
    );
  };

  const handleDownloadImage = async () => {
    if (!imageResult) return;

    setIsDownloadingImage(true);
    try {
      if (guestMode) {
        const response = await fetch(imageResult.downloadUrl ?? imageResult.objectUrl);
        if (!response.ok) {
          throw new Error(`guest download failed: ${response.status}`);
        }

        const blob = await response.blob();
        // 앱 셸 안에서는 네이티브가 사진첩에 넣는다 — 끝날 때까지 기다려야 실패를 잡는다.
        await downloadBlob(
          blob,
          buildDownloadFilename(imageResult.displayName, FOURCUT_OUTPUT_EXTENSION),
        );
        // 로그인으로 이어 가도 다시 만들 수 있도록 **원본 4장과 만드는 방법**을 보관한다.
        // 완성본이 아니라 재료를 담는 이유는 lib/pendingGuestSave.ts 주석 참고.
        const stored = await storeGuestHandoff();
        showGuestSavedNotice(
          stored ? { loginHref: GUEST_LOGIN_HANDOFF_PATH } : undefined,
        );
        return;
      }

      const url = await getMediaDownloadUrl(imageResult.mediaId);
      await downloadFromUrl(
        url,
        buildDownloadFilename(imageResult.displayName, FOURCUT_OUTPUT_EXTENSION),
      );
    } catch (error) {
      console.error(error);
      showStatusNotice(
        "이미지를 다운로드하지 못했어요",
        // 앱에서 사진첩 권한이 막힌 실패는 네이티브 안내를 그대로 띄운다 —
        // "설정에서 켜 주세요" 는 재시도로 풀리지 않아 폴백 문구가 거짓말이 된다.
        getNativeSaveErrorMessage(error) ??
          getUserFacingApiErrorMessage(error, "잠시 후 다시 시도해 주세요."),
      );
    } finally {
      setIsDownloadingImage(false);
    }
  };

  /*
    비회원이 로그인으로 이동할 때 **원본 4장과 만드는 방법**을 보관한다. OAuth 는 전체 페이지
    리다이렉트라 메모리 세션이 통째로 사라지므로, 로그인 전에 IndexedDB 로 옮겨 둔다.

    **완성본(`imageResult`)을 기다리지 않는다** — 보관하는 것은 완성본이 아니라 재료라,
    아직 만드는 중이어도 합성이 실패한 뒤여도 그대로 만들어진다. 예전에는 완성본이 없으면
    보관을 통째로 건너뛰고 로그인으로 보냈는데, 그래서 결과를 기다리다 누른 사람과 실패
    화면에서 누른 사람만 로그인 뒤에 이어받을 것이 하나도 없었다.
  */
  const handleGuestLogin = async () => {
    // 보관에 실패했을 때 무엇을 하라고 할지. 아직 완성본이 없으면 "내려받으라"고 할 수 없다 —
    // 가리킬 다운로드 카드가 화면에 없다(imageResult 일 때만 그린다).
    const retryHint = imageResult
      ? "먼저 이미지를 내려받아 주세요."
      : "결과가 다 만들어진 뒤에 다시 눌러 주세요.";

    setIsHandingOffToLogin(true);
    try {
      const stored = await storeGuestHandoff();
      if (!stored) {
        showStatusNotice(
          "결과를 보관하지 못했어요",
          // 원인을 단정하지 않는다. 용량만이 아니라 사생활 보호 모드·저장소 차단도
          // 여기로 온다(lib/pendingGuestSave.ts).
          `이 브라우저에 사진을 잠시 담아 두지 못했어요. ${retryHint}`,
        );
        return;
      }
    } catch (error) {
      console.error(error);
      showStatusNotice(
        "결과를 보관하지 못했어요",
        `로그인하는 사이에 사진이 사라질 수 있어요. ${retryHint}`,
      );
      return;
    } finally {
      setIsHandingOffToLogin(false);
    }

    router.push(GUEST_LOGIN_HANDOFF_PATH);
  };

  // 업로드로 왔으면 업로드 쪽 프레임 고르기로 돌아간다. 그냥 /shoot 으로 보내면
  // 다음이 카메라라, 갤러리로 만들던 사람이 촬영 화면에 떨어진다.
  // `keepShots=1` — 찍은 사진을 두고 프레임만 다시 고른다(app/shoot/page.tsx).
  const reselectFrameHref = fromUpload
    ? "/shoot?source=upload&keepShots=1"
    : "/shoot?keepShots=1";

  /*
    **사진은 두고 프레임만 바꾼다.**

    예전에는 이 링크가 `/shoot` 로 보냈고, 그 화면은 들어오자마자 세션을 통째로 `reset()`
    했다 — 프레임만 바뀌는 것이 아니라 찍은 8장과 고른 4장이 함께 사라졌다. 이 자리의 안내는
    "다른 프레임을 골라 주세요"(lib/fourcutCompose.ts)라 사진은 그대로라는 뜻으로 읽히는데
    실제로는 사진이 먼저 없어졌고, /shoot/select 에는 프레임을 바꾸는 UI 가 없어 우회로도 없었다.

    지금은 `keepShots=1` 로 보낸다. 사진을 그대로 들고 프레임 화면에 서고, 고른 프레임의 슬롯
    비율이 같으면 곧장 고르는 화면으로 간다. 비율이 다르면(세로 4컷 → 네모 4컷) 그 사진을
    쓸 수 없으므로 그때 비우고 촬영으로 보낸다 — 판단은 /shoot 이 한다.
  */
  const handleReselectFrame = () => {
    router.push(reselectFrameHref);
  };

  const handleShareImage = async () => {
    if (!imageResult) return;

    if (guestMode) {
      showGuestShareNotice();
      return;
    }

    setIsSharingImage(true);
    try {
      const url = await getMediaDownloadUrl(imageResult.mediaId);
      const result = await shareOrCopyLink({
        title: `${imageResult.displayName} | 하루컷`,
        text: "방금 완성한 하루컷 이미지예요.",
        url,
      });

      if (result === "copied") {
        showStatusNotice(
          "링크를 복사했어요",
          "하루 동안 열리는 이미지 링크예요. 바로 붙여넣어 공유할 수 있어요.",
        );
      }
    } catch (error) {
      console.error(error);
      // 링크는 이미 만들어졌고 복사만 거부당한 경우다(lib/share.ts 의 CopyFailedError).
      // "링크를 준비하지 못했어요 / 잠시 후 다시" 로 말하면 원인도 틀리고, 사용자는
      // 기다렸다 다시 눌러 같은 자리에서 또 막힌다 — 해야 할 일이 다르므로 갈라 안내한다.
      if (isCopyFailedError(error)) {
        showStatusNotice(
          "링크를 복사하지 못했어요",
          "링크는 만들었지만 브라우저가 복사를 막았어요. 브라우저에서 복사를 허용한 뒤 다시 눌러 주세요.",
        );
        return;
      }
      showStatusNotice(
        "이미지 링크를 준비하지 못했어요",
        getUserFacingApiErrorMessage(error, "잠시 후 다시 시도해 주세요."),
      );
    } finally {
      setIsSharingImage(false);
    }
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-(--hc-text) lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 lg:max-w-3xl">
        <PageHeader
          title={fromUpload ? "네컷 결과" : "촬영 결과"}
          description={
            guestMode
              ? "이미지는 지금 바로 내려받을 수 있어요. 기록 보관과 링크 공유는 로그인 뒤에 열려요."
              : "완성된 네 컷을 저장하거나 링크로 공유해 보세요."
          }
        />

        {eventName ? <EventBanner eventName={eventName} /> : null}

        {/*
          준비 중일 때만 상태 카드를 둔다. 예전에는 다 된 뒤에도 "결과 준비 완료 / 마음에 드는 결과를
          저장하거나…" 카드가 헤더 설명과 같은 말을 한 번 더 했고, 옆의 '이미지' 초록 칩은 아무
          정보가 없었다. 완성되면 그림과 다운로드 카드가 곧 상태다.
        */}
        {isPreparing ? (
          <section
            role="status"
            aria-live="polite"
            className="rounded-[28px] border border-(--hc-border) bg-(--hc-surface) p-4"
          >
            <p className="text-sm font-semibold text-(--hc-text)">결과 준비 중</p>
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-(--hc-border) bg-(--hc-surface-strong) px-3.5 py-2.5 text-[12px]">
              <span className="text-(--hc-text)">이미지</span>
              <span className="text-(--hc-muted)">
                {imageState === "processing" ? "생성 중…" : "대기 중"}
              </span>
            </div>
          </section>
        ) : null}

        {/*
          다 되면 **저장된 그림 자체**를 보여준다.

          FramePreview 는 고른 원본 4장을 DOM 으로 겹쳐 그리는 구도 미리보기라, 저장본과
          갈리는 자리가 있다. 회원 경로는 누끼(배경 제거)를 올리기 전에 픽셀에 굽고
          (`lib/fourcutCompose.ts`) 프레임 장식은 서버가 그리는데, 둘 다 이 미리보기에는
          없다 — 사용자는 배경이 그대로 남은 그림을 본 뒤 배경이 지워진 그림을 내려받았다.
          비회원도 마찬가지로 브라우저가 그린 결과가 따로 있다.

          미리보기에 누끼를 다시 굽는 길로 가지 않는다. 세그멘테이션은 실기기에서 장당
          약 1초인데(lib/canvas/personCutout.ts), 그 픽셀은 이미 결과물 안에 들어 있다.
          같은 일을 두 번 하는 대신 이미 만들어진 것을 띄운다.

          아직 만들어지는 중이거나 완성본을 못 불러왔을 때만 미리보기가 자리를 지킨다.
        */}
        <section className="mx-auto w-full max-w-md">
          {resultImageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resultImageSrc}
              alt="완성된 네컷 결과"
              decoding="async"
              // 완성본은 레이아웃과 같은 비율로 그려진다. 미리 잡아 두면 늦게 도착해도
              // 화면이 밀리지 않는다.
              style={{
                aspectRatio: `${layout.totalWidth} / ${layout.totalHeight}`,
              }}
              className="w-full rounded-lg border border-(--hc-border) bg-(--hc-surface-strong) object-contain"
              onError={() => setIsResultImageBroken(true)}
            />
          ) : (
            <FramePreview
              frameId={frameId}
              media={previewImage}
              borderColor={effectiveBorderColor}
              outputFilter={outputFilter}
              theme={themeData}
            />
          )}
        </section>

        {imageError ? <p className="text-[11px] text-(--hc-danger)">{imageError}</p> : null}

        {imageState === "error" && isImageErrorRetryable ? (
          <button
            type="button"
            onClick={() => {
              imageGenerationKeyRef.current = null;
              unregisterGeneratedPngDebug(IMAGE_DEBUG_SCOPE, debugImageUrlRef.current);
              debugImageUrlRef.current = null;
              if (guestImageUrlRef.current?.startsWith("blob:")) {
                URL.revokeObjectURL(guestImageUrlRef.current);
              }
              guestImageUrlRef.current = null;
              clearResults();
              setImageState("idle");
              setImageError(null);
              // 실패했을 때 imageResult 는 이미 null 이라 clearResults() 만으로는
              // effect 의존성이 하나도 안 바뀐다. 이 값을 올려야 실제로 다시 돈다.
              setRetryNonce((nonce) => nonce + 1);
            }}
            className="hc-button-secondary rounded-full border px-4 py-2 text-xs font-semibold transition"
          >
            다시 준비하기
          </button>
        ) : null}

        {imageState === "error" && !isImageErrorRetryable ? (
          // 링크가 아니라 버튼이다 — 누르면 이동이 아니라 확인이 먼저다(위 주석 참고).
          <button
            type="button"
            onClick={handleReselectFrame}
            className="hc-button-secondary inline-flex w-fit rounded-full border px-4 py-2 text-xs font-semibold transition"
          >
            프레임 다시 고르기
          </button>
        ) : null}

        {imageResult ? (
          <GeneratedAssetDownloadCard
            title="이미지 다운로드"
            description={
              guestMode
                ? "파일 이름을 다듬고 체험 결과 이미지를 바로 내려받을 수 있어요."
                : "기록으로 저장될 파일 이름을 수정하고 이미지를 내려받을 수 있어요."
            }
            asset={imageResult}
            metaLabel={guestMode ? "비회원 체험 · 이미지" : "촬영 결과 · 이미지"}
            draftName={imageNameDraft}
            onChangeName={setImageNameDraft}
            onSaveName={handleSaveImageName}
            onDownload={handleDownloadImage}
            onShare={guestMode ? undefined : handleShareImage}
            isSavingName={isSavingImageName}
            isDownloading={isDownloadingImage}
            isSharing={isSharingImage}
          />
        ) : null}

        {guestMode && imageResult ? (
          <section className="hc-surface-hero rounded-[28px] border p-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-(--hc-text)">
                비회원 체험 결과 안내
              </p>
              {/* 목록은 @harucut/shared 한 벌에서 읽는다 — 모달·FAQ 와 같은 값을 말해야 한다. */}
              <p className="text-[12px] leading-6 text-(--hc-muted)">
                지금은 {withJosa(GUEST_ALLOWED_ITEMS, "을/를")} 해볼 수 있어요.{" "}
                {withJosa(GUEST_MEMBER_ONLY_ITEMS, "은/는")} 로그인 후에 이용할 수 있어요.
              </p>
              <p className="text-[12px] leading-6 text-(--hc-muted)">
                체험 결과는 이 화면을 벗어나면 사라져요. 먼저 이미지를 내려받거나
                &ldquo;로그인하고 저장하기&rdquo;로 이어 가 주세요.
              </p>
            </div>

            {/*
              다운로드 버튼은 위 카드에 하나면 된다 — 같은 화면에 같은 버튼이 둘이었다.
              회원 기능은 감추지 않고 자리를 남긴다(가입하면 무엇이 더 되는지 보여야 한다).
              다만 문장을 버튼 모양에 담지 않는다 — 잠긴 기능임을 말하는 조용한 줄이다.
            */}
            <div className="mt-4 flex flex-col divide-y divide-(--hc-border) rounded-2xl border border-(--hc-border)">
              <button
                type="button"
                onClick={showGuestRestrictedNotice}
                className="flex min-h-11 items-center justify-between gap-3 px-4 text-left text-[13px] font-semibold text-(--hc-text) transition hover:bg-(--hc-surface-highlight)"
              >
                <span>기록 보관</span>
                <span className="text-[12px] font-medium text-(--hc-muted)">로그인 후</span>
              </button>
              <button
                type="button"
                onClick={showGuestShareNotice}
                className="flex min-h-11 items-center justify-between gap-3 px-4 text-left text-[13px] font-semibold text-(--hc-text) transition hover:bg-(--hc-surface-highlight)"
              >
                <span>링크 공유</span>
                <span className="text-[12px] font-medium text-(--hc-muted)">로그인 후</span>
              </button>
            </div>
          </section>
        ) : null}

        <div className="flex gap-2">
          <Link
            href={
              guestMode
                ? fromUpload
                  ? "/shoot/upload"
                  : "/shoot/capture"
                : "/shoot/select"
            }
            className="hc-button-secondary inline-flex h-11 flex-1 items-center justify-center rounded-full border px-4 text-center text-[13px] font-semibold transition"
          >
            {guestMode && !fromUpload ? "다시 촬영하기" : "사진 다시 고르기"}
          </Link>
          {guestMode ? (
            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={isHandingOffToLogin}
              className="hc-button-secondary inline-flex h-11 flex-1 items-center justify-center rounded-full border px-4 text-center text-[13px] font-semibold transition disabled:opacity-40"
            >
              {isHandingOffToLogin ? "결과 보관 중…" : "로그인하고 저장하기"}
            </button>
          ) : (
            <Link
              href="/home"
              className="hc-button-secondary inline-flex h-11 flex-1 items-center justify-center rounded-full border px-4 text-center text-[13px] font-semibold transition"
            >
              홈으로 가기
            </Link>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
