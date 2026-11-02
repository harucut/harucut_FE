import { EventNeutralState } from "@/components/participation/EventNeutralState";

export default function EventNotFound() {
  return <EventNeutralState title="행사를 찾을 수 없어요" message="받은 링크를 다시 확인해 주세요. 그래도 안 되면 행사 담당자에게 문의해 주세요." />;
}
