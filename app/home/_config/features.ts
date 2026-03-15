import type { Feature } from "../_components/FeatureCard";
import { Camera, History, Palette, Upload } from "lucide-react";

export const features: Feature[] = [
  {
    id: "shoot",
    title: "사진 촬영",
    description:
      "카메라로 8장을 자동 촬영하고, 4장을 골라 인생네컷으로 만들어요.",
    href: "/shoot",
    icon: Camera,
  },
  {
    id: "upload",
    title: "사진 업로드",
    description: "가지고 있는 사진 4장을 업로드해 네컷 프레임을 만들어요.",
    href: "/upload",
    icon: Upload,
  },
  {
    id: "theme",
    title: "프레임 꾸미기",
    description: "프레임에 스티커와 텍스트를 올려 나만의 테마를 만들 수 있어요.",
    href: "/theme",
    icon: Palette,
  },
  {
    id: "history",
    title: "사진 기록",
    description: "저장된 사진과 영상을 다시 보고 내려받을 수 있어요.",
    href: "/history",
    icon: History,
  },
];
