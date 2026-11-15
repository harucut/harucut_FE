"use client";

import { useEffect, useState } from "react";
import { isNativeShell } from "@/lib/nativeBridge";
import { photoFileType } from "@/lib/share";

/**
 * 공유할 사진 파일을 미리 받아 둔다(lib/share.ts 의 sharePhoto).
 *
 * 누른 뒤에 받으면 그사이 제스처가 풀려 브라우저(특히 iPhone Safari)가 공유 창을 거절한다. 그래서 사진이 화면에 뜰 때 받아
 * 둔다 — 행사 결과 화면과 같은 판단이다(components/participation/ResultReceiver.tsx).
 *
 * 파일 공유가 되는 브라우저에서만 받는다(navigator.canShare). 앱 안에서는 네이티브가 주소로 내려받으므로 받지 않는다.
 * 저장소가 교차 출처 읽기를 막으면 못 받는다 — 그때는 null 이고, 공유는 링크로 간다.
 *
 * 주소가 바뀌면(기록 보기에서 옆 사진으로) 받던 것을 끊고 새로 받는다. 돌려주는 파일은 늘 지금 주소의 것이다.
 */
export function usePreparedPhotoFile(url: string | null, filename: string): File | null {
  const [prepared, setPrepared] = useState<{ url: string; file: File } | null>(null);

  useEffect(() => {
    if (!url || isNativeShell() || typeof navigator === "undefined" || typeof navigator.canShare !== "function") return;
    const controller = new AbortController();
    void fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob || controller.signal.aborted) return;
        const file = new File([blob], filename, { type: photoFileType(blob, filename) });
        if (navigator.canShare({ files: [file] })) setPrepared({ url, file });
      })
      // 교차 출처 읽기 거부·끊김. 받아 두지 못했을 뿐이다 — 공유는 링크로 간다.
      .catch(() => {});
    return () => controller.abort();
  }, [url, filename]);

  return prepared?.url === url ? prepared.file : null;
}
