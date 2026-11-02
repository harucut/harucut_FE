"use client";

import { useRef, useState } from "react";
import { QrCode } from "@/components/qr/QrCode";

/**
 * 참가 링크와 QR. 주최자는 이걸 식장 테이블에 올리거나 단체 대화방에 붙인다 — 화면 캡처로 넘기게 두지 않는다.
 * QR 은 SVG 로 저장해 인쇄소에 넘겨도 깨지지 않는다.
 */
export function StudioJoinLink({
  url,
  fileName,
  size = 140,
  stacked = false,
}: {
  url: string;
  /** 저장할 QR 파일 이름(확장자 빼고). */
  fileName: string;
  size?: number;
  /** 시트처럼 좁은 자리에서는 QR 을 위에 크게 둔다. */
  stacked?: boolean;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const saveQr = () => {
    const svg = holderRef.current?.querySelector("svg");
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", "1024");
    copy.setAttribute("height", "1024");
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${fileName}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    setNotice("QR 을 저장했어요.");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("링크를 복사했어요.");
    } catch {
      setNotice("복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.");
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${stacked ? "items-center" : "sm:flex-row sm:items-center"}`}>
      {/* QR 은 흰 바탕이 필요하다. 어두운 테마에서도 스캐너가 경계를 찾게 한 겹 띄운다. */}
      <div ref={holderRef} className="w-fit shrink-0 overflow-hidden rounded-2xl bg-white p-2">
        <QrCode value={url} size={size} label="행사 참가 링크 QR" />
      </div>
      <div className={`flex w-full min-w-0 flex-col gap-3 ${stacked ? "items-center text-center" : ""}`}>
        <p translate="no" className="break-all text-[14px] font-semibold">
          {url}
        </p>
        <div className={`flex flex-wrap gap-2 ${stacked ? "justify-center" : ""}`}>
          <button type="button" onClick={saveQr} className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold">
            QR 저장
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-11 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold transition hover:border-(--hc-border-strong)"
          >
            인쇄용 카드
          </button>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="h-11 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold transition hover:border-(--hc-border-strong)"
          >
            링크 복사
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold transition hover:border-(--hc-border-strong)"
          >
            내 폰으로 열기
          </a>
        </div>
        <p className="text-[12px] text-(--hc-muted)">PC 에서는 휴대폰 카메라로 QR 을 찍으면 내 폰에서 열려요.</p>
        {notice ? (
          <p role="status" className="text-[13px]">
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 인쇄할 때만 보이는 A6 카드(globals.css 「Studio」 구역). 화면에는 그리지 않고, 「인쇄용 카드」가 window.print 로 이 카드만 찍는다.
 * 행사 고객에게도 그대로 건넬 수 있게 이름 · QR · 짧은 안내만 싣는다.
 */
export function StudioPrintCard({ name, url }: { name: string; url: string }) {
  return (
    <div aria-hidden className="studio-print-card">
      <p className="studio-print-card-name">{name}</p>
      <QrCode value={url} size={260} label="" />
      <p className="studio-print-card-guide">휴대폰 카메라로 QR을 찍고 네 컷을 남겨 주세요.</p>
      <p translate="no" className="studio-print-card-url">
        {url.replace(/^https?:\/\//, "")}
      </p>
    </div>
  );
}
