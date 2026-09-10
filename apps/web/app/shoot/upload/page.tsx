"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { nativeEnsureCameraPermission } from "@/lib/nativeBridge";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";
import { importPhotoFiles } from "@/lib/photoImport";
import { resolveMembership } from "@/lib/authSession";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";

/**
 * 칸 수를 모를 때(프레임 없이 들어온 순간)의 기본값. 그 상태는 아래 effect 가 곧
 * `/shoot` 로 되돌리므로 한 프레임만 산다.
 */
const FALLBACK_SLOT_COUNT = Math.max(
  ...Object.values(FRAME_LAYOUTS).map((layout) => layout.slots.length),
);

/**
 * 담아 둘 수 있는 최대 장수 = 칸 수 × 이 배수.
 *
 * 앨범에서 수백 장을 고르면 그 전부가 최대 2400px JPEG data URL 로 디코딩·재인코딩된 뒤
 * 세션과 DOM 에 남는다. 다음 단계에서 쓰는 것은 칸 수만큼뿐인데 모바일 웹뷰에서는 이
 * 흐름만으로 수백 MB 를 잡아 화면이 멈춘다. 고르고 남을 만큼은 받고 그 위는 변환 전에 자른다.
 */
const PHOTOS_PER_SLOT = 6;

/**
 * 갤러리에서 사진을 불러오는 화면.
 *
 * 촬영 흐름에서 **카메라 대신 파일을 쓰는 단계**다. 여기서 사진을 촬영본과 같은 형태로
 * 맞춰 세션에 담고 나면, 그 뒤(4장 고르기 → 서버 합성 → 내려받기)는 촬영과 완전히 같은
 * 화면을 지난다 — 사진이 어디서 왔는지 알 필요가 없기 때문이다.
 */
export default function ShootUploadPage() {
  const router = useRouter();
  const frameId = useShootSession((state) => state.frameId);
  const shots = useShootSession((state) => state.shots);
  const eventName = useShootSession((state) => state.eventName);
  const addShotPhotos = useShootSession((state) => state.addShotPhotos);
  const removeShotPhoto = useShootSession((state) => state.removeShotPhoto);

  /*
    장수는 **이 세션의 프레임** 칸 수에서 뽑는다.

    전체 레이아웃의 최대 칸 수로 잡으면 지금은 넷 다 4컷이라 같은 값이지만, 6컷 프레임이
    하나 생기는 순간 4컷으로 찍는 사람에게 6장을 요구하게 된다 — 화면이 요구하는 수는
    사용자가 고른 프레임이 정한다.
  */
  const slotCount = frameId
    ? FRAME_LAYOUTS[frameId].slots.length
    : FALLBACK_SLOT_COUNT;
  /** 칸을 다 채워야 다음으로 갈 수 있다. */
  const minPhotos = slotCount;
  const maxPhotos = slotCount * PHOTOS_PER_SLOT;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  /**
   * 사진 가져오기 회차 번호.
   *
   * HEIC 변환과 여러 장 디코딩이 도는 동안 뒤로가기로 이 화면을 떠나도 Promise 는 그대로
   * 끝나고, 그 결과가 담기는 곳은 이 화면의 상태가 아니라 **전역 촬영 세션**이다.
   * `/shoot` 의 초기화가 먼저 끝났으면 지난 선택이 새 세션에 되살아나고, 사용자가 다시
   * 불러오기를 시작했으면 새로 고른 사진과 섞인다. 시작할 때 번호를 올려 두고 끝난 뒤
   * 번호가 그대로일 때만 반영한다 — 언마운트에서도 올리므로 떠난 뒤의 결과는 버려진다.
   */
  const importGenerationRef = useRef(0);

  useEffect(
    () => () => {
      importGenerationRef.current += 1;
    },
    [],
  );

  // 불러온 사진이 있는데 아직 저장 전이면 새로고침/이탈 시 유실 경고를 띄운다.
  useUnsavedWorkGuard(shots.length > 0);

  useEffect(() => {
    // 프레임 없이 바로 들어오면 어느 판형으로 만들지 알 수 없다.
    if (!frameId) router.replace("/shoot?source=upload");
  }, [frameId, router]);

  /*
    **갤러리 불러오기는 회원만 쓴다 — 화면에서도 집행한다.**

    한동안 이 판정의 유일한 집행 지점이 프록시였다(`GUEST_MEMBER_ONLY_PREFIXES`). 그런데
    프록시는 **요청이 올 때** 한 번 보고, 그 판정의 근거인 게스트 쿠키는 나중에 심길 수 있다.
    행사 진입이 그렇다 — 인증 쿠키가 남은 브라우저는 프록시를 그대로 지나가고, 회원이
    아니라는 판정은 화면이 인증 왕복 뒤에 내린다(app/shoot/page.tsx). 그 사이에
    `/shoot?source=upload&event=...` 에서 「확인」을 누르면 이 화면이 **먼저** 열리고,
    뒤늦게 게스트가 되어도 이미 들어와 있어 아무도 되돌리지 않았다.

    **다만 쿠키만 보고 내보내지는 않는다.** 게스트 쿠키는 남아 있는데 세션은 멀쩡한 회원이
    있다 — 이 판정이 붙기 전 배포에서 체험을 한 번 눌러 본 사람이다. 프록시는 그 사람을
    살아 있는 access 로 통과시키는데, 여기서 쿠키만 보고 되돌리면 쿠키가 만료(7일)되거나
    다시 로그인하기 전까지 회원 전용 기능을 잃는다. 그래서 `resolveMembership()` 으로
    한 번 물어보고 **확정된 게스트만** 내보낸다. 회원으로 확인되면 낡은 쿠키를 그 자리에서
    걷는다(`usePublicShootCta` 와 같은 처리다).

    왕복 하나를 기다리는 비용은 실제로는 거의 안 든다 — 요청 시점에 이미 게스트인 사람은
    프록시가 이 화면을 열어 주지도 않는다. 여기 오는 것은 「들어온 뒤에 게스트가 되는」
    경우와 위의 낡은 쿠키 회원뿐이다.

    **쿠키를 읽기 전에는 묻지 않는다.** `accessMode` 의 초깃값이 "member" 라 `hydrated` 를
    안 보면 진짜 회원이 한 프레임 동안 헛왕복을 한다.
  */
  const guestHydrated = useGuestTrialStore((state) => state.hydrated);
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const exitGuestMode = useGuestTrialStore((state) => state.exitGuestMode);

  useEffect(() => {
    if (!guestHydrated || accessMode !== "guest") return;

    void (async () => {
      const membership = await resolveMembership();

      // 낡은 게스트 쿠키를 든 회원이다. 쿠키를 걷고 이 화면에 그대로 둔다.
      if (membership === "member") {
        exitGuestMode();
        return;
      }
      // 못 물어봤으면(`unknown`) 아무것도 하지 않는다 — 서버가 잠깐 흔들렸다고 회원을
      // 내보내지 않는다. 다음 진입에서 다시 판정된다.
      if (membership !== "guest") return;

      /*
        **되돌릴 때 행사 이름과 고른 프레임을 들려 보낸다.**

        `/shoot` 은 쿼리도 `keepShots` 도 없는 진입을 **새 촬영**으로 보고 세션을 비운다.
        그냥 `/shoot?guestNotice=restricted` 로 보내면 행사 배너와 QR 이 지정한 프레임이 함께
        사라져, 참가자가 기본 프레임으로 찍게 된다. 막는 것은 회원 전용 경로 하나지 행사
        진입 전체가 아니다.
      */
      const params = new URLSearchParams({ guestNotice: "restricted" });
      if (frameId) params.set("frame", frameId);
      if (eventName) params.set("event", eventName);
      router.replace(`/shoot?${params.toString()}`);
    })();
  }, [
    accessMode,
    eventName,
    exitGuestMode,
    frameId,
    guestHydrated,
    router,
  ]);

  /*
    **회원으로 확인되기 전까지 이 화면의 조작을 잠근다.**

    위 effect 는 `guest` 로 확정됐을 때만 내보내고 `unknown` 이면 손을 뗀다 — 서버가 잠깐
    흔들렸다고 회원을 쫓아내지 않기 위해서다. 그런데 그것만 두면 **이미 게스트인 사람**이
    그 틈에 그대로 쓴다: 행사 화면이 게스트로 판정해 쿠키를 심은 뒤 이 화면이 열렸는데
    여기 조회가 5xx 로 떨어지면, 되돌리지도 않고 막지도 않아 갤러리 불러오기를 끝까지 쓴다
    (그 뒤 결과 화면은 같은 `accessMode` 를 보고 브라우저에서 합성한다).

    그래서 「내보낸다」와 「쓰게 둔다」를 가른다 — 내보내는 것은 확정된 게스트뿐이고,
    **쓰게 두는 것은 회원으로 확인된 뒤**다. 쿠키가 게스트인 동안은 잠가 둔다.
    회원으로 확인되면 위 effect 가 `exitGuestMode()` 로 쿠키를 걷어 `accessMode` 가
    `member` 가 되므로, 이 잠금은 그때 저절로 풀린다.
  */
  const memberOnlyLocked = guestHydrated && accessMode === "guest";

  const overLimitNotice = (count: number) =>
    `사진은 최대 ${maxPhotos}장까지 담을 수 있어 ${count}장은 제외했어요.`;

  const handleChangeFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // 같은 파일을 다시 고를 수 있게 값을 비운다(값이 남으면 change 가 안 뜬다).
    event.target.value = "";
    if (files.length === 0) return;

    // 이미 담아 둔 것까지 합쳐 남은 자리를 센다.
    const room = Math.max(0, maxPhotos - shots.length);
    // 꽉 찼으면 형식을 볼 것도 없다 — 무엇을 골랐든 한 장도 못 담는다.
    if (room === 0) {
      setNotice(overLimitNotice(files.length));
      return;
    }

    importGenerationRef.current += 1;
    const generation = importGenerationRef.current;
    setIsImporting(true);
    try {
      /*
        고른 것을 **통째로** 넘기고 상한은 인자로 준다.

        여기서 먼저 잘라 버리면 지원하지 않는 형식이 앞에 몰렸을 때 쓸 수 있는 사진이
        상한 밖으로 밀려난다(28장 중 앞 24장이 heic 면 남는 것이 0장이었다). 형식을 아는
        곳이 거른 뒤에 자르고, 자르는 자리는 여전히 디코딩 앞이다.
      */
      const { dataUrls, notice: importNotice, overLimitCount } =
        await importPhotoFiles(files, { limit: room });
      // 변환 중에 화면을 떠났으면 늦게 온 결과는 버린다(위 회차 번호 주석).
      if (importGenerationRef.current !== generation) return;
      if (dataUrls.length > 0) addShotPhotos(dataUrls);
      setNotice(
        [overLimitCount > 0 ? overLimitNotice(overLimitCount) : null, importNotice]
          .filter(Boolean)
          .join(" ") || null,
      );
    } finally {
      // 지난 회차가 뒤늦게 끝나며 진행 중 표시를 꺼 버리지 않게 한다.
      if (importGenerationRef.current === generation) setIsImporting(false);
    }
  };

  const enough = shots.length >= minPhotos;

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-(--hc-text) lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 lg:max-w-3xl">
        <PageHeader
          title="사진 불러오기"
          // 장수가 프레임에서 오므로 문구도 "네 컷"으로 박지 않는다.
          description={`이 프레임에 넣을 사진을 ${minPhotos}장 이상 골라 주세요.`}
          backHref="/shoot?source=upload"
          backLabel="프레임 다시 선택"
        />

        {eventName ? <EventBanner eventName={eventName} /> : null}

        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_IMAGE_ACCEPT}
          multiple
          onChange={handleChangeFiles}
          disabled={memberOnlyLocked}
          className="hidden"
        />

        <button
          type="button"
          onClick={async () => {
            /*
              선택기를 열기 **전에** 카메라 권한을 받아 둔다.

              안드로이드 셸은 `android.permission.CAMERA` 를 선언해 두었는데(촬영 화면이
              요구한다), 그 권한을 아직 안 받았으면 WebView 가 파일 선택기에서
              **「사진 찍기」 항목을 통째로 뺀다.** 촬영 화면을 한 번도 안 쓴 사용자는
              갤러리만 보게 된다(apps/web/lib/nativeBridge.ts 의 주석 참고).

              **결과를 보지 않는다.** 거절해도 갤러리는 그대로 열리므로 하려던 일은
              계속할 수 있다. 앱이 아니거나, 이 메시지를 모르는 옛 셸이면 기다리지 않고
              곧바로 돌아온다 — 기다리면 선택기가 2분간 안 열린다(nativeBridge 의 판 수 확인).
            */
            await nativeEnsureCameraPermission();
            fileInputRef.current?.click();
          }}
          disabled={isImporting || memberOnlyLocked}
          className="hc-button-secondary flex h-12 items-center justify-center gap-2 rounded-2xl border text-[14px] font-semibold disabled:opacity-50"
        >
          <ImagePlus className="h-4.5 w-4.5" />
          {isImporting ? "불러오는 중…" : "사진 고르기"}
        </button>

        {notice ? (
          // 제외 안내는 오류가 아니라 알림이다 — 위험색(빨강)을 쓰지 않는다.
          <p role="status" className="text-[12px] leading-[1.6] text-(--hc-muted)">
            {notice}
          </p>
        ) : null}

        {shots.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-(--hc-border) px-4 py-10 text-center text-[13px] leading-[1.7] text-(--hc-muted)">
            아직 고른 사진이 없어요.
            <br />
            여러 장을 한 번에 고르고, 다음 단계에서 {minPhotos}장을 정할 수 있어요.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {shots.map((src, index) => (
                <div
                  key={`${index}-${src.slice(-24)}`}
                  className="relative aspect-square overflow-hidden rounded-xl border border-(--hc-border) bg-(--hc-surface)"
                >
                  {/* 사진은 data URL 이라 next/image 로 최적화할 것이 없다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`불러온 사진 ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {/* 보이는 원은 24px, 눌리는 면은 44px. 터치 규칙(min-height 44)이 폭 24 버튼을
                      세로 타원으로 늘리던 것을 막는다. */}
                  <button
                    type="button"
                    onClick={() => removeShotPhoto(index)}
                    aria-label={`불러온 사진 ${index + 1} 빼기`}
                    className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-full"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white">
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[12px] text-(--hc-muted)">
              {shots.length}장 골랐어요.
              {enough ? "" : ` ${minPhotos - shots.length}장 더 필요해요.`}
            </p>
          </>
        )}

        <button
          type="button"
          onClick={() => router.push("/shoot/select")}
          disabled={!enough}
          className="hc-button-primary inline-flex h-12 items-center justify-center rounded-full text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enough ? "다음 단계로" : `사진을 ${minPhotos}장 이상 골라 주세요`}
        </button>
      </div>
    </main>
  );
}
