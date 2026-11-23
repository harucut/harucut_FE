import { EventNeutralState } from "@/components/participation/EventNeutralState";

export default function BoothNotFound() {
  return <EventNeutralState title="없는 화면이에요" message="부스 주소를 다시 확인해 주세요. 담당자가 알려 준 주소로 열어야 해요." />;
}
