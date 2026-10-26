import { neutralEventMetadata, neutralEventViewport } from "@/lib/event/eventMetadata";

export const metadata = neutralEventMetadata("사진 받기");
export const viewport = neutralEventViewport;

export default function ResultLayout({ children }: { children: React.ReactNode }) {
  return children;
}
