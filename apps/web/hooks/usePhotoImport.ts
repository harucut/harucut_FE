"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { nativeEnsureCameraPermission } from "@/lib/nativeBridge";
import { importPhotoFiles } from "@/lib/photoImport";

/**
 * 갤러리에서 사진을 불러온다 — 사진 고르기 화면의 「사진 불러오기」 칸이 쓴다.
 *
 * 예전에는 프레임을 고른 뒤 따로 「사진 불러오기」 화면을 지나 사진 고르기로 갔다. 2026-11-15 「갤러리에서
 * 불러오기는 프레임 고르고 나면 바로 사진 고르기로 들어가서 거기서 올릴 수 있게 하는 게 좋지 않을까?」 —
 * 불러오기 화면을 없애고 사진 고르기 화면 안에서 불러온다. 이 훅은 그 화면이 하던 일을 그대로 옮긴 것이다.
 *
 * 상한은 부른 쪽이 준다(칸 수 × 배수). 고른 것을 **통째로** importPhotoFiles 에 넘기고 남은 자리만 상한으로
 * 준다 — 화면이 먼저 자르면 지원하지 않는 형식이 앞에 몰렸을 때 쓸 수 있는 사진이 밀려난다(lib/photoImport.ts).
 */
export function usePhotoImport({
  maxPhotos,
  currentCount,
  onImported,
}: {
  maxPhotos: number;
  /** 이미 담아 둔 장수. 남은 자리를 센다. */
  currentCount: number;
  /** 변환이 끝난 사진(data URL). 빈 결과로는 부르지 않는다. */
  onImported: (dataUrls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  /**
   * 가져오기 회차 번호.
   *
   * HEIC 변환과 여러 장 디코딩이 도는 동안 화면을 떠나도 Promise 는 그대로 끝나고, 그 결과가 담기는 곳은 이
   * 화면의 상태가 아니라 **전역 촬영 세션**이다. 시작할 때 번호를 올려 두고 끝난 뒤 번호가 그대로일 때만
   * 반영한다 — 언마운트와 cancel 에서도 올리므로 떠난 뒤(또는 내보낸 뒤)의 결과는 버려진다.
   */
  const generationRef = useRef(0);
  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    [],
  );

  const overLimitNotice = (count: number) =>
    `사진은 최대 ${maxPhotos}장까지 담을 수 있어 ${count}장은 제외했어요.`;

  /** 선택기를 연다. 「사진 불러오기」 칸을 누를 때 부른다. */
  const open = async () => {
    /*
      선택기를 열기 **전에** 카메라 권한을 받아 둔다.

      안드로이드 셸은 `android.permission.CAMERA` 를 선언해 두었는데(촬영 화면이 요구한다), 그 권한을 아직 안
      받았으면 WebView 가 파일 선택기에서 **「사진 찍기」 항목을 통째로 뺀다.** 촬영 화면을 한 번도 안 쓴
      사용자는 갤러리만 보게 된다(lib/nativeBridge.ts 의 주석 참고).

      **결과를 보지 않는다.** 거절해도 갤러리는 그대로 열리므로 하려던 일은 계속할 수 있다. 앱이 아니거나 이
      메시지를 모르는 옛 셸이면 기다리지 않고 곧바로 돌아온다.
    */
    await nativeEnsureCameraPermission();

    /*
      **권한 안내를 보고 온 뒤에는 이 클릭으로 선택기를 못 연다.**

      파일 선택기는 브라우저의 일시적 사용자 활성화가 살아 있을 때만 열린다. 권한 안내를 오래 보고 돌아오면 그
      유효 시간이 끝나 있어, 위 `await` 뒤의 `click()` 은 오류도 없이 아무 일도 하지 않는다. 남은 시간을 숫자로
      재지 않고 브라우저에 묻는다(`navigator.userActivation.isActive`). 없는 브라우저에서는 그냥 연다.
    */
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (activation && !activation.isActive) {
      setNotice("카메라 권한을 확인했어요. ‘사진 불러오기’를 한 번 더 눌러 주세요.");
      return;
    }

    inputRef.current?.click();
  };

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // 같은 파일을 다시 고를 수 있게 값을 비운다(값이 남으면 change 가 안 뜬다).
    event.target.value = "";
    if (files.length === 0) return;

    const room = Math.max(0, maxPhotos - currentCount);
    // 꽉 찼으면 형식을 볼 것도 없다 — 무엇을 골랐든 한 장도 못 담는다.
    if (room === 0) {
      setNotice(overLimitNotice(files.length));
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    setIsImporting(true);
    try {
      const { dataUrls, notice: importNotice, overLimitCount } = await importPhotoFiles(files, { limit: room });
      // 변환 중에 화면을 떠났거나 내보냈으면 늦게 온 결과는 버린다(위 회차 번호 주석).
      if (generationRef.current !== generation) return;
      if (dataUrls.length > 0) onImported(dataUrls);
      setNotice(
        [overLimitCount > 0 ? overLimitNotice(overLimitCount) : null, importNotice].filter(Boolean).join(" ") || null,
      );
    } finally {
      // 지난 회차가 뒤늦게 끝나며 진행 중 표시를 꺼 버리지 않게 한다.
      if (generationRef.current === generation) setIsImporting(false);
    }
  };

  /** 진행 중인 변환을 버린다 — 비회원으로 바뀌어 내보낼 때. 그 사이 끝난 사진이 세션에 남지 않게 한다. */
  const cancel = useCallback(() => {
    generationRef.current += 1;
    setIsImporting(false);
  }, []);

  return { inputRef, open, onChange, isImporting, notice, cancel, full: currentCount >= maxPhotos };
}
