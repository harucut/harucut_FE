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
  // 서버가 주는 값은 숫자가 아니라 짧은 공개 식별자 문자열이다("Opwxk27uADEJ").
  // 실측 2026-08-20 — docs/backend-contract.md
  id: string;
  email: string;
  username: string;
  profileUrl: string | null;
  // 서버 Provider enum 5종. 구글/애플 로그인도 실제로 내려온다.
  loginPlatform?: "GOOGLE" | "KAKAO" | "NAVER" | "APPLE" | "HARUCUT" | null;
  planTier?: "BASIC" | "PLUS" | "PRO" | null;
  monthlyPrice?: number | null;
};

export type LoginResponseData = {
  userStatus: UserStatus;
};

export type PresignedUploadContentType = "JPEG" | "PNG" | "WEBP" | "GIF";

export type UserMedia = {
  mediaId: number;
  s3Key: string;
  displayName?: string | null;
  displayname?: string | null;
  /** 목록용 축소본(긴 변 512, JPEG). */
  thumbnailUrl?: string | null;
  /**
   * 화면에 그대로 띄우기 위한 URL.
   * `downloadUrl` 은 `Content-Disposition: attachment` 가 붙어 <img> 에 쓰기 나쁘다.
   */
  viewUrl?: string | null;
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
      // 서버가 채워 주는 조회용 서명 URL(응답 전용). 요청에 실어도 무시된다.
      url?: string;
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
  // 스웨거 ComponentResponse의 레이어 순서 필드는 zIndex 하나뿐이다(required).
  zIndex?: number;
  style?: Record<string, unknown>;
  styleJson?: Record<string, unknown>;
  // 참고: 서버는 `renderedKey` 를 **응답에 내려주지 않는다**(합성 전용).
  // 그래서 저장된 TEXT 프레임을 다시 저장할 때는 글자 층을 항상 새로 구워야 한다.
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
  // 관리자가 등록한 기본 제공 프레임. 내 프레임 목록에 섞여 오지만 소유자가 아니라
  // 수정/삭제 요청은 403이 된다(FrameServiceImpl.validateOwner). 읽기 전용으로만 다뤄야 한다.
  isSystem?: boolean;
  // 칸별 누끼(boolean 4개, 촬영 슬롯 순서). 서버가 저장·반환한다.
  cellCutouts?: boolean[];
  // frameType으로 서버가 고정하는 캔버스 크기(요청값은 저장되지 않는다).
  canvasWidth?: number;
  canvasHeight?: number;
};

// GET /api/auth/user/subscription/usage 응답 (프레임 보관 한도·사용량).
// *Limit/*RemainingCount 가 -1 이거나 *Unlimited === true 이면 무제한을 의미한다.
// 결제 주기(시작/만료)는 이 엔드포인트에 없다. 필요해지면
// GET /api/auth/subscriptions 의 SubscriptionResponse.currentPeriodStart/currentPeriodEnd 를 쓴다.
export type SubscriptionUsage = {
  planTier: string;
  frameRetentionLimit: number;
  frameRetentionUsedCount: number;
  frameRetentionRemainingCount: number;
  frameRetentionUnlimited: boolean;
};
