import type { Metadata } from "next";
import { LandingView } from "@/components/landing/LandingView";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return <LandingView />;
}
