import type { Meta, StoryObj } from "@storybook/react";
import { FramePreview } from "@/components/frame/FramePreview";

const meta = {
  title: "Frame/FramePreview",
  component: FramePreview,
  args: {
    frameId: "classic-4",
    media: [
      { type: "image", src: "https://picsum.photos/600/900?random=1" },
      { type: "image", src: "https://picsum.photos/600/900?random=2" },
      { type: "image", src: "https://picsum.photos/600/900?random=3" },
      { type: "image", src: "https://picsum.photos/600/900?random=4" },
    ],
  },
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof FramePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Classic: Story = {};

export const Wide: Story = {
  args: {
    frameId: "wide-4",
  },
};

