"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { RetryButton } from "@/components/ui/LoadFailed";
import { usePreparedPhotoFile } from "@/hooks/usePreparedPhotoFile";
import { buildDownloadFilename } from "@/lib/fourcutOutput";
import { getNativeSaveErrorMessage } from "@/lib/nativeBridge";
import { saveImageFromSignedUrl, saveImageMessage, sharePhotoFile } from "@/lib/share";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center bg-(--background) px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex w-full max-w-md items-center py-2">
        {/* 받은 사람에게 하루컷은 처음이다. 로고는 소개 첫 화면으로 간다. */}
        <BrandMark href="/" label="하루컷 처음으로" />
      </header>
      <div className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 py-6">{children}</div>
    </main>
  );
}

/**
 * 받은 사람이 보는 사진(app/s/[token]/page.tsx). 사진과 「사진 저장」 하나다.
 *
 * 그림과 저장은 서명 주소를 직접 쓰지 않고 이 사이트의 `/s/<토큰>/image`·`/download` 를 거친다 — 부를 때마다 새 서명 주소로
 * 보내서, 페이지를 띄워 둔 채 시간이 지나도 깨지지 않는다.
 *
 * 저장은 행사 결과 화면과 같다(components/participation/ResultReceiver.tsx). 휴대폰은 사진을 미리 받아 두었다가 공유 창에
 * 넘긴다 — iPhone 은 거기서 「이미지 저장」을 고르면 사진첩에 들어간다. 못 받았으면 내려받는다.
 */
export function SharedPhotoView({ token, title, extension }: { token: string; title: string; extension: string }) {
  const base = `/s/${encodeURIComponent(token)}`;
  const filename = buildDownloadFilename(title, extension);
  const prepared = usePreparedPhotoFile(`${base}/image`, filename);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const onSave = async () => {
    setNotice(null);
    if (prepared) {
      const shared = await sharePhotoFile(prepared);
      if (shared) {
        setNotice(saveImageMessage(shared));
        return;
      }
    }
    setSaving(true);
    try {
      // 앱이 내려받을 수도 있어 절대 주소로 넘긴다.
      const saved = await saveImageFromSignedUrl(new URL(`${base}/download`, window.location.origin).href, filename);
      setNotice(saveImageMessage(saved));
    } catch (error) {
      setNotice(getNativeSaveErrorMessage(error) ?? "사진을 저장하지 못했어요. 다시 눌러 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Frame>
      {/* 서명 주소로 넘어가는 그림이라 next/image 최적화를 거치지 않는다. 이 주소가 리퍼러로 새지 않게 한다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${base}/image`}
        alt={title}
        referrerPolicy="no-referrer"
        className="h-auto max-h-[68svh] w-auto max-w-full object-contain drop-shadow-[0_18px_40px_rgba(20,20,15,0.22)]"
      />
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={saving}
        aria-busy={saving || undefined}
        className="hc-button-primary inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full text-[15px] font-extrabold disabled:opacity-60"
      >
        <Download aria-hidden className="size-4" strokeWidth={2.4} />
        사진 저장
      </button>
      {notice ? (
        <p role="status" className="max-w-xs text-center text-[13px] text-(--hc-muted)">
          {notice}
        </p>
      ) : null}
    </Frame>
  );
}

/**
 * 열 수 없는 링크. 닫힌 것(사진 삭제·보관 기간 지남·없는 주소)과 잠깐 못 닿은 것을 가른다 — 앞은 다시 열어도 같고, 뒤는
 * 다시 열면 된다. 무엇 때문에 닫혔는지는 말하지 않는다(백엔드도 가르지 않는다).
 */
export function SharedPhotoUnavailable({ closed }: { closed: boolean }) {
  return (
    <Frame>
      <h1 className="text-[18px] font-extrabold">{closed ? "열 수 없는 링크예요" : "사진을 불러오지 못했어요"}</h1>
      <p className="-mt-2 text-center text-[13px] text-(--hc-muted)">
        {closed ? "사진이 지워졌거나 보관 기간이 지났어요." : "잠시 후 다시 열어 주세요."}
      </p>
      {closed ? null : <RetryButton onClick={() => window.location.reload()} />}
    </Frame>
  );
}
