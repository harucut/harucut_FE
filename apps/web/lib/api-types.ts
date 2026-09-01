/**
 * 모든 응답이 담기는 공통 봉투.
 *
 * `message` 와 `data` 는 **선택이다** — 스웨거가 못박아 뒀고 실측도 같다:
 * "message 는 실패일 때만 실린다. 성공 응답에는 키 자체가 없다",
 * "data 는 없으면 키 자체가 없다(데이터 없는 200 이 흔하다)".
 *
 * 예전에는 둘 다 필수로 적어 둬서, 값이 안 오는 응답에도 타입이 "있다"고 말했다.
 * 그래서 `res.data.data.foo` 가 컴파일은 통과하고 런타임에 터질 수 있었다.
 * 값이 반드시 필요한 자리에서는 `requireData()` 로 꺼낸다(lib/apiEnvelope.ts).
 */
export type ApiEnvelope<T> = {
  code: string;
  status: number;
  message?: string | null;
  data?: T;
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
  /** 목록용 축소본(긴 변 512, JPEG). */
  thumbnailUrl?: string | null;
  /**
   * 화면에 그대로 띄우기 위한 URL.
   * `downloadUrl` 은 `Content-Disposition: attachment` 가 붙어 <img> 에 쓰기 나쁘다.
   */
  viewUrl?: string | null;
  downloadUrl?: string | null;
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

export type PlanTierCode = "BASIC" | "PLUS" | "PRO";

// GET /api/auth/subscriptions 응답.
export type Subscription = {
  /**
   * **실제로 적용 중인 등급.** 주기가 끝났는데 강등 배치가 아직 안 돌았으면
   * `status` 가 ACTIVE 여도 여기는 BASIC 으로 내려온다 — 권한 판정은 항상 이 값으로 한다.
   */
  planTier: PlanTierCode;
  /**
   * DB 원본이라 `planTier` 와 어긋나 보일 수 있다.
   * CANCELED 는 "자동갱신만 껐다"는 뜻이고 주기 끝까지는 유료 등급이 유지된다.
   */
  status: "ACTIVE" | "CANCELED" | "PAST_DUE" | "EXPIRED" | "GRANTED";
  /** BASIC 이면 키 자체가 없다. */
  currentPeriodStart?: string | null;
  /** BASIC 이면 키 자체가 없다. */
  currentPeriodEnd?: string | null;
  autoRenew?: boolean;
};

// GET /api/auth/coupons 응답 한 건.
export type MyCoupon = {
  /** 사용 이력의 ID다. 쿠폰 자체의 ID 가 아니다. */
  publicId: string;
  couponName: string;
  grantTier: PlanTierCode;
  /** REDEEMED 적용 완료 · RESERVED 현재 구독이 끝나면 시작될 예약분. */
  status: "RESERVED" | "REDEEMED";
  /** 코드를 입력한 시각. 적용이 시작된 시각이 아니다. */
  redeemedAt?: string | null;
};

// POST /api/auth/coupons/redeem 응답.
export type CouponRedeemResult = {
  /**
   * true 지금 바로 적용됐다 · false 현재 구독이 끝난 뒤 시작하도록 **예약**됐다.
   * ⚠️ false 는 실패가 아니다 — 200 이고 쿠폰은 정상 등록됐다.
   */
  applied: boolean;
  grantTier: PlanTierCode;
  /** applied=false 면 현재 결제 주기가 끝나는 시각이다. */
  startsAt?: string | null;
  /** 항상 startsAt + 1개월. 쿠폰마다 기간을 정할 수 없다. */
  endsAt?: string | null;
};
