import { QrCode } from "lucide-react";

/**
 * 행사장 QR 로 들어온 참가자에게 "여기가 어디인지"를 알려 주는 띠.
 *
 * QR 을 찍은 사람은 하루컷을 고른 적이 없다. 앱 이름도 모르는 채로 촬영 화면에 떨어지므로,
 * 어느 행사의 프레임으로 찍고 있는지를 촬영이 끝날 때까지 화면에 남긴다.
 */
export function EventBanner({ eventName }: { eventName: string }) {
  return (
    // 초록 칩이 아니다. 촬영 흐름에는 선택 보더·체크·CTA 가 이미 초록이라 배너까지 초록이면
    // 첫 화면에 초록이 넷이었다. 맥락 표시는 중립 면 위에 굵은 이름으로 충분하다.
    <p className="flex items-center gap-2 rounded-2xl border border-(--hc-border) bg-(--hc-surface) px-3.5 py-2.5 text-[12px] font-semibold leading-normal text-(--hc-text)">
      <QrCode aria-hidden className="h-4 w-4 shrink-0 text-(--hc-muted)" />
      <span className="min-w-0">
        <b className="font-extrabold">{eventName}</b> 프레임으로 찍고 있어요
      </span>
    </p>
  );
}
