import { SharedPhotoUnavailable } from "@/components/share/SharedPhotoView";

/** 닫힌 공유 링크(사진 삭제·보관 기간 지남·없는 주소). 이유는 가르지 않는다 — 백엔드도 가르지 않는다. */
export default function SharedPhotoNotFound() {
  return <SharedPhotoUnavailable closed />;
}
