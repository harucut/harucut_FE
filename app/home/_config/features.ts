import type { Feature } from "../_components/FeatureCard";

import { Camera, Upload, Palette, History } from "lucide-react";

export const features: Feature[] = [
  {
    id: "shoot",
    title: "사진 촬영",
    description:
      "웹캠으로 8장을 자동 촬영하고, 4장을 골라 인생네컷으로 만들어요.",
    href: "/shoot",
    icon: Camera,
  },
  {
    id: "upload",
    title: "사진 업로드",
    description: "이미 찍어둔 사진 4장을 업로드해서 네컷 프레임을 만들어요.",
    href: "/upload",
    icon: Upload,
  },
  {
    id: "theme",
    title: "테마 꾸미기",
    description: "프레임, 스티커, 텍스트로 나만의 테마를 꾸밀 수 있어요.",
    href: "/theme",
    icon: Palette,
  },
  {
    id: "history",
    title: "사진 기록",
    description: "이 기기에서 만든 인생네컷을 1주일 동안 다시 볼 수 있어요.",
    href: "/history",
    comingSoon: true,
    icon: History,
  },
];
