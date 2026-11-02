import type { Metadata, Viewport } from "next";
import { neutralEventMetadata, neutralEventViewport } from "@/lib/event/eventMetadata";
import { loadPublicEventOnServer } from "@/lib/event/publicEventServer";
import { isHexColor } from "@/lib/event/pageTheme";

type Props = { params: Promise<{ slug: string }> };

// 행사 이름과 색은 서버에서 넣는다 — 첫 화면부터 그 행사의 모습이고 탭 제목도 행사 이름이다. 못 받으면 중립이다.
// 하루컷 제목·아이콘으로 대체하지 않는다(기획 R5 18절).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadPublicEventOnServer(slug);
  return neutralEventMetadata(event?.name ?? "행사 촬영");
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { slug } = await params;
  const event = await loadPublicEventOnServer(slug);
  const bg = event?.theme?.colors?.bg;
  return isHexColor(bg) ? { ...neutralEventViewport, themeColor: bg } : neutralEventViewport;
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
