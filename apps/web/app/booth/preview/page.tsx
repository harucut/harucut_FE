import type { Metadata } from "next";
import { EventPreviewHost } from "@/components/participation/EventPreview";

export const metadata: Metadata = {
  title: "행사 화면 미리보기",
  robots: { index: false, follow: false },
};

/**
 * Studio 의 행사 화면 미리보기가 iframe 으로 띄우는 자리. 실제 화면 컴포넌트를 실제 뷰포트 크기로 그린다 —
 * 화면이 기기 폭·높이(dvh·vmin·방향)를 따라 배치되므로 iframe 이어야 기기별 모양이 그대로 나온다.
 * 스스로 데이터를 읽지 않고, 같은 출처의 부모가 보낸 값만 그린다. 다른 곳에 띄울 수 없다(next.config.ts).
 */
export default function BoothPreviewPage() {
  return <EventPreviewHost />;
}
