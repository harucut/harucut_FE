import { EventStudio } from "@/components/studio/EventStudio";

export default async function StudioEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventStudio eventId={eventId} />;
}
