import { Suspense } from "react";
import { StudioHome } from "@/components/studio/StudioHome";

export default function StudioPage() {
  // 공간 선택을 주소(?workspace=)가 들고 있어 useSearchParams 를 쓴다.
  return (
    <Suspense>
      <StudioHome />
    </Suspense>
  );
}
