export type ApiEnvelope<T> = {
  code: string;
  status: number;
  message: string | null;
  data: T;
};

export type UserStatus =
  | "ACTIVE"
  | "DELETED"
  | "DELETED_REQUESTED"
  | "BLOCKED";

export type UserInfo = {
  id: number;
  email: string;
  username: string;
  profileUrl: string | null;
  loginPlatform?: "NAVER" | "KAKAO" | "HARUCUT" | null;
  planTier?: "BASIC" | "PLUS" | "PRO" | null;
  monthlyPrice?: number | null;
};

export type LoginResponseData = {
  userStatus: UserStatus;
};

export type PresignedUploadContentType = "JPEG" | "PNG" | "WEBP" | "GIF";

export type UserMediaType = "PHOTO";

export type UserMedia = {
  mediaId: number;
  mediaType: UserMediaType;
  s3Key: string;
  displayName?: string | null;
  displayname?: string | null;
  downloadUrl?: string | null;
  originalFileName?: string;
  createdAt?: string;
};

export type RemoteFrameType = "CLASSIC" | "WIDE" | "GRID" | "POLAROID";

export type RemoteFrameBackground =
  | {
      type: "COLOR";
      value: string;
    }
  | {
      type: "IMAGE";
      key?: string;
      opacity?: number;
    };

export type RemoteFrameComponent = {
  id?: number | string;
  type: "PHOTO" | "STICKER" | "TEXT";
  source: string;
  key?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  rotation?: number;
  // 스웨거 ComponentResponse는 zIndex와 zindex를 모두 내려준다. 어느 쪽이든 읽는다.
  zIndex?: number;
  zindex?: number;
  style?: Record<string, unknown>;
  styleJson?: Record<string, unknown>;
};

// GET /api/auth/user/frame 응답.
// 서버는 **활성 프레임만** 내려준다 — 다운그레이드로 비활성된 초과분은 응답에 없다.
// 따라서 클라이언트가 보관 한도로 잠금 대상을 추정하면 안 된다(목록 = 사용 가능한 전부).
export type RemoteFrame = {
  frameId: number;
  title: string;
  description?: string;
  source?: string;
  frameType: RemoteFrameType;
  background?: RemoteFrameBackground;
  components: RemoteFrameComponent[];
};

// GET /api/auth/user/subscription/usage 응답 (프레임 보관 한도·사용량).
// *Limit/*RemainingCount 가 -1 이거나 *Unlimited === true 이면 무제한을 의미한다.
export type SubscriptionUsage = {
  planTier: string;
  frameRetentionLimit: number;
  frameRetentionUsedCount: number;
  frameRetentionRemainingCount: number;
  frameRetentionUnlimited: boolean;
  currentCycleStartAt: string;
  currentCycleEndAt: string;
};
