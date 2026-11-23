import { neutralEventMetadata, neutralEventViewport } from "@/lib/event/eventMetadata";

export const metadata = neutralEventMetadata("현장 부스");
export const viewport = neutralEventViewport;

export default function BoothLayout({ children }: { children: React.ReactNode }) {
  return children;
}
