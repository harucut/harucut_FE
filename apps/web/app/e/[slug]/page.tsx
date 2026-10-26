import { notFound } from "next/navigation";
import { EventParticipation } from "@/components/participation/EventParticipation";

/** 개인 휴대폰 참가 — 주최자가 배포한 행사 링크·QR 로 들어온다(기획 R5 4절). */
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // ADR-0007 slug 문법(소문자·숫자·하이픈 3~40자). 다른 모양은 행사 주소가 아니다.
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) notFound();
  return <EventParticipation slug={slug} />;
}
