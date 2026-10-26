import { EventPhotoBox } from "@/components/studio/EventPhotoBox";

export default async function StudioEventPhotosPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventPhotoBox eventId={eventId} />;
}
