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

export type PresignedUploadContentType =
  | "JPEG"
  | "PNG"
  | "WEBP"
  | "GIF"
  | "MP4"
  | "WEBM"
  | "MOV";

export type UserMediaType = "PHOTO" | "VIDEO";

export type UserMedia = {
  mediaId: number;
  mediaType: UserMediaType;
  s3Key: string;
  displayName?: string | null;
  displayname?: string | null;
  downloadUrl?: string | null;
  thumbnailUrl?: string | null;
  originalS3Key?: string;
  originalFileName?: string;
  transcodeJobId?: string;
  createdAt?: string;
};

export type TranscodeTaskStatus =
  | "QUEUED"
  | "SUBMITTED"
  | "PROGRESSING"
  | "COMPLETE"
  | "ERROR";

export type TranscodeTaskSubmitResponse = {
  taskId: string;
  jobId: string;
  status: TranscodeTaskStatus;
  requestedAt?: string;
};

export type TranscodeTaskStatusResponse = {
  taskId: string;
  jobId: string;
  status: TranscodeTaskStatus;
  errorMessage?: string | null;
  media?: UserMedia | null;
  createdAt?: string;
  updatedAt?: string;
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
    }
  | {
      type: "VIDEO";
      key?: string;
      autoPlay?: boolean;
      loop?: boolean;
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
  zIndex: number;
  style?: Record<string, unknown>;
  styleJson?: Record<string, unknown>;
};

export type RemoteFrame = {
  frameId: number;
  title: string;
  description?: string;
  source?: string;
  frameType: RemoteFrameType;
  background?: RemoteFrameBackground;
  components: RemoteFrameComponent[];
};

// GET /api/auth/user/subscription/usage 응답.
// *Limit/*RemainingCount 가 -1 이거나 *Unlimited === true 이면 무제한을 의미한다.
export type SubscriptionUsage = {
  planTier: string;
  videoUploadMonthlyLimit: number;
  videoUploadUsedCount: number;
  videoUploadRemainingCount: number;
  videoUploadUnlimited: boolean;
  frameRetentionLimit: number;
  frameRetentionUsedCount: number;
  frameRetentionRemainingCount: number;
  frameRetentionUnlimited: boolean;
  currentCycleStartAt: string;
  currentCycleEndAt: string;
};
