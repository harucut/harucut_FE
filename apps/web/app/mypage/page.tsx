"use client";

import {
  ChangeEvent,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, LogOut, PencilLine } from "lucide-react";
import { getLoginPlatformLabel, josa, parseServerDateTime } from "@harucut/shared";
import { PasswordChangeDialog } from "@/components/mypage/PasswordChangeDialog";
import { SettingRow } from "@/components/mypage/SettingRow";
import { SingleFieldDialog } from "@/components/ui/SingleFieldDialog";
import {
  FrameCapacityMeter,
  resolveFrameCapacity,
} from "@/components/frame/FrameCapacityMeter";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { NativeNotificationSetting } from "@/components/mobile/NativeNotificationSetting";
import { ColorThemePreferencePanel } from "@/components/theme/ColorThemePreferencePanel";
import { TermsConsentPanel } from "@/components/terms/TermsConsentPanel";
import { getPlanDisplayName } from "@/constants/plans";
import { UploadValidationError } from "@/lib/presignedUploadApi";
import { listMyCoupons, redeemCoupon } from "@/lib/couponApi";
import { resolvePlanInfo } from "@/constants/planLimits";
import type { MyCoupon,
  Subscription,
  SubscriptionUsage } from "@/lib/api-types";
import { clientApi } from "@/lib/clientApi";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { uploadProfileImage } from "@/lib/profileImageApi";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";
import {
  getMyUserInfo,
  getMySubscription,
  getSubscriptionUsage,
  type UserInfo,
} from "@/lib/userApi";
import { listMyMedia } from "@/lib/userMediaApi";
import { listMyFrames } from "@/lib/remoteFrameApi";

/**
 * 화면 맨 위 한 줄짜리 알림.
 *
 * 예전에는 성공을 `alert()` 로 알렸다(닉네임·비밀번호·프로필 이미지 셋 다). 브라우저
 * 모달은 이 디자인의 것이 아닌 데다, 확인을 누르기 전까지 방금 바뀐 화면을 가린다 —
 * 정작 사용자가 보고 싶은 건 바뀐 결과다. 실패는 초록 글자로 떴는데, 초록은 이 제품에서
 * "지금 여기를 보라"는 신호이지 오류색이 아니다.
 */
type Notice = { kind: "ok" | "error"; text: string };

type SectionId = "account" | "plan" | "notif" | "frames" | "pref";

type Stats = {
  total: number;
  thisMonth: number;
  frames: number;
};

const SECTION_META: Record<SectionId, { title: string; sub: string }> = {
  account: { title: "계정 정보", sub: "이메일, 닉네임, 비밀번호 변경" },
  plan: { title: "요금제", sub: "플랜 및 결제 관리" },
  notif: { title: "알림·약관 동의", sub: "마케팅 수신 동의, 푸시" },
  frames: { title: "내 프레임", sub: "보관한 프레임" },
  pref: { title: "설정", sub: "화질, 언어" },
};

/**
 * 한 줄로 쌓는다. 데스크톱과 모바일이 같은 순서, 같은 카드다.
 *
 * 예전에는 데스크톱이 260px 사이드바 + 우측 패널이었다. 그런데 섹션이 넷뿐이고 넷을
 * 다 합쳐도 1,328px — 두 화면이 안 된다(실측). 사이드바는 섹션이 길어서 쌓으면 찾기
 * 힘들 때 값을 하는데 여기는 반대였다. 사는 것은 "스크롤 안 함" 하나였고, 치르는 것은
 * 전부 보려면 클릭 세 번과 **구조적으로 빈 오른쪽**이었다(사이드바 ~580px 대 우측 최대
 * 450px — 오른쪽이 늘 더 짧다).
 *
 * 덤으로 이 파일이 `isDesktop` 뒤에 들고 있던 레이아웃 두 벌이 한 벌이 됐다.
 */
const SECTIONS: SectionId[] = ["account", "plan", "notif", "frames", "pref"];

export default function MyPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 비밀번호는 이메일(HARUCUT) 가입 계정에만 있다.
  // 아직 user 를 못 읽었으면 폼도 안내문도 띄우지 않는다 — 소셜 계정에 폼이 잠깐 보였다
  // 사라지거나, 이메일 계정에 "비밀번호가 없어요"가 깜빡이는 쪽이 더 나쁘다.
  // loginPlatform 이 비어 있으면 로컬 계정으로 본다(getLoginPlatformLabel 기본값과 같다).
  const loginPlatformLabel = getLoginPlatformLabel(user?.loginPlatform);
  const isSocialAccount =
    !!user?.loginPlatform && user.loginPlatform !== "HARUCUT";
  const canChangePassword = user != null && !isSocialAccount;

  const [notice, setNotice] = useState<Notice | null>(null);
  /** 조회 자체가 실패한 경우. 알림과 달리 사라지지 않아야 한다. */
  const [loadError, setLoadError] = useState<string | null>(null);

  // 고치는 일은 전부 다이얼로그가 맡는다. 페이지는 "지금 열려 있는가"와
  // "저장 중인가"만 들고 있으면 된다 — 입력값은 다이얼로그 안에서 산다.
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [savingNickname, setSavingNickname] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [isUploadingProfile, setIsUploadingProfile] = useState(false);

  // 조회 실패를 0으로 위장하지 않으려고 stats는 null로 시작한다.
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  // 구독(결제 주기·자동갱신)과 사용량(보관 한도)은 다른 엔드포인트다. 둘 다 실패해도
  // 화면은 떠야 하므로 null 로 눕히고, 그때는 해당 줄을 아예 그리지 않는다.
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [coupons, setCoupons] = useState<MyCoupon[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponNotice, setCouponNotice] = useState<string | null>(null);

  /**
   * 좁은 화면에서 펼쳐 둔 섹션. 넓은 화면은 전부 펼쳐 두므로 이 값을 보지 않는다.
   *
   * 예전에는 `isDesktop` 을 matchMedia 로 재서 레이아웃 두 벌 중 하나만 렌더했다.
   * 같은 섹션 폼이 양쪽에 동시에 마운트되는 걸 막으려던 것인데, 레이아웃이 한 벌이
   * 된 지금은 막을 것이 없다. 펼침 여부는 CSS(`lg:block`)가 가른다.
   */
  const [openMobile, setOpenMobile] = useState<SectionId | null>(null);

  const loadUser = async () => {
    try {
      const nextUser = await getMyUserInfo();
      setUser(nextUser);
      setLoadError(null);
    } catch (error) {
      console.error(error);
      setLoadError("내 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * 프로필 이미지처럼 서버가 값을 다시 내려주는 변경 뒤에 쓴다.
   *
   * `loading` 을 다시 켜지 않는다. 켜면 화면 전체가 스켈레톤으로 돌아갔다 오는데,
   * 사용자는 아바타 한 장을 바꿨을 뿐이고 그 사이 페이지가 통째로 깜빡인다.
   */
  const refreshUser = async () => {
    await loadUser();
  };

  // 스탯 3셀은 우리 실제 데이터(기록 미디어 / 이번 달 / 보관 프레임)로 매핑한다.
  // 조회에 실패하면 0이 아니라 statsError로 구분해 '기록이 사라진 것처럼' 보이지 않게 한다.
  const loadStats = async () => {
    try {
      const [media, frames, nextUsage, nextSubscription, nextCoupons] =
        await Promise.all([
          listMyMedia(),
          listMyFrames(),
          // 구독 사용량은 못 받아도 목록 개수로 폴백하므로 실패를 무시한다.
          getSubscriptionUsage().catch(() => null),
          // 구독 행이 없으면 404(SUBS-004). 정상 흐름에서는 안 생기지만 화면은 떠야 한다.
          getMySubscription().catch(() => null),
          listMyCoupons().catch(() => []),
        ]);

      const now = new Date();
      const thisMonth = media.filter((item) => {
        const created = parseServerDateTime(item.createdAt);
        if (!created) return false;
        return (
          created.getFullYear() === now.getFullYear() &&
          created.getMonth() === now.getMonth()
        );
      }).length;

      setStats({
        total: media.length,
        thisMonth,
        frames: frames.length,
      });
      setUsage(nextUsage);
      setSubscription(nextSubscription);
      setCoupons(nextCoupons);
      setStatsError(null);
    } catch (error) {
      console.error(error);
      setStats(null);
      setStatsError("기록을 불러오지 못했어요.");
    }
  };

  const fetchStats = async () => {
    setStatsError(null);
    await loadStats();
  };

  // 최초 진입은 초기 상태(loading=true, loadError=null, statsError=null)와 같아
  // 별도 setState 없이 바로 조회한다. setState는 응답이 온 뒤에만 일어난다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void loadUser();
    void loadStats();
  }, []);

  const closeNickname = useCallback(() => {
    setNicknameOpen(false);
    setNicknameError(null);
  }, []);

  const handleChangeUsername = async (nextUsername: string) => {
    setSavingNickname(true);
    setNicknameError(null);

    try {
      await clientApi.patch("/api/client/user/username", {
        username: nextUsername,
      });
      setUser((prev) => (prev ? { ...prev, username: nextUsername } : prev));
      setNicknameOpen(false);
      setNotice({ kind: "ok", text: "닉네임을 바꿨어요." });
    } catch (error) {
      console.error(error);
      setNicknameError(
        getUserFacingApiErrorMessage(error, "닉네임을 바꾸지 못했어요."),
      );
    } finally {
      setSavingNickname(false);
    }
  };

  const closePassword = useCallback(() => {
    setPasswordOpen(false);
    setPasswordError(null);
  }, []);

  const handleChangePassword = async (values: {
    oldPassword: string;
    newPassword: string;
  }) => {
    setSavingPassword(true);
    setPasswordError(null);

    try {
      await clientApi.patch("/api/client/auth/password/change", values);
      setPasswordOpen(false);
      setNotice({ kind: "ok", text: "비밀번호를 바꿨어요." });
    } catch (error) {
      console.error(error);
      setPasswordError(
        getUserFacingApiErrorMessage(error, "비밀번호를 바꾸지 못했어요."),
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const profileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 파일을 고르면 **바로 올린다.**
   *
   * 예전에는 고르기와 올리기가 나뉘어 있어서, 파일을 고르고도 옆의 「업로드」를 누르지
   * 않으면 아무 일도 일어나지 않았다. 고를 것이 한 장뿐이고 되돌릴 일도 없는 동작에
   * 확인 단계를 두면 미완의 상태만 하나 늘어난다.
   */
  const handleProfileFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 값을 바로 비운다. 남겨 두면 같은 파일을 다시 골랐을 때 change 가 발생하지 않아
    // 아무 일도 일어나지 않는다(업로드가 실패해 다시 시도할 때 실제로 그랬다).
    e.target.value = "";
    if (!file) return;

    setIsUploadingProfile(true);
    setNotice(null);

    try {
      await uploadProfileImage(file);
      await refreshUser();
      setNotice({ kind: "ok", text: "프로필 이미지를 바꿨어요." });
    } catch (error) {
      console.error(error);
      /*
        올리기 전에 우리가 걸러낸 것(형식·용량·파일 없음)만 자기 문구를 살린다.

        "ApiRequestError 가 아니면 로컬 오류" 로 가르면 안 된다 — S3 PUT 은 fetch 를 직접
        부르므로 오프라인의 `TypeError("Failed to fetch")` 와 비정상 응답의
        `Error("S3 upload failed: 403")` 도 ApiRequestError 가 아니다. 그것들까지 로컬로
        오인하면 영문 원문이 그대로 화면에 나간다. 우리가 던진 것만 타입으로 가른다.
      */
      setNotice({
        kind: "error",
        text:
          error instanceof UploadValidationError
            ? error.message
            : getUserFacingApiErrorMessage(
                error,
                "프로필 이미지를 바꾸지 못했어요.",
              ),
      });
    } finally {
      setIsUploadingProfile(false);
    }
  };

  const handleLogout = async () => {
    setNotice(null);
    setIsSubmitting(true);

    try {
      await clientApi.delete("/api/client/logout");
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setNotice({ kind: "error", text: "로그아웃에 실패했어요." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExit = async () => {
    const ok = confirm(
      "정말 탈퇴하시겠어요?\n탈퇴 신청일부터 30일 내로 다시 로그인하면 계정을 복구할 수 있어요.",
    );
    if (!ok) return;

    setNotice(null);
    setIsSubmitting(true);

    try {
      await clientApi.delete("/api/client/exit");
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setNotice({ kind: "error", text: "회원 탈퇴에 실패했어요." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 성공 알림은 잠깐 떴다 사라진다. 실패는 남긴다 — 사용자가 무엇을 해야 하는지
  // 읽을 시간이 필요하고, 대개 다시 시도해야 한다(기록 화면과 같은 규칙).
  useEffect(() => {
    if (notice?.kind !== "ok") return undefined;

    const timeoutId = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const profileInitial = user?.username?.trim()?.[0] ?? "U";

  // 서버 등급(BASIC/PLUS/PRO) 대신 사람이 읽는 이름(무료/베이직/프로)으로 보여준다.
  const planDisplayName = getPlanDisplayName(user?.planTier) ?? "무료";
  const planPriceSuffix = user?.monthlyPrice
    ? ` · 월 ${user.monthlyPrice.toLocaleString("ko-KR")}원`
    : "";

  // 프레임 보관 한도는 서버 구독 사용량을 우선 쓰고, 미조회 시 목록 개수로 폴백한다.
  const frameCapacity = useMemo(
    () => resolveFrameCapacity(resolvePlanInfo(user?.planTier), usage, stats?.frames ?? 0),
    [user?.planTier, usage, stats?.frames],
  );
  const frameCapacityText = frameCapacity.unlimited
    ? `보관한 프레임 ${frameCapacity.used}개 · 무제한`
    : `보관한 프레임 ${frameCapacity.used}/${frameCapacity.plan.limit}개`;

  const statCells = useMemo(
    () =>
      [
        { n: stats ? `${stats.total}` : "—", l: "총 기록" },
        { n: stats ? `${stats.thisMonth}` : "—", l: "이번 달" },
        { n: stats ? `${frameCapacity.used}` : "—", l: "보관 프레임" },
      ] as const,
    [stats, frameCapacity.used],
  );

  /**
   * 프로필 이미지를 바꾸는 자리는 **그 이미지 자신**이다.
   *
   * 예전에는 계정 정보 목록 저 아래에 파일 입력창과 「업로드」 버튼이 따로 있었다. 바꿀
   * 대상은 화면 맨 위에 크게 떠 있는데 손잡이는 스크롤 밖에 있었고, 아바타 쪽에는 누를
   * 수 있다는 표시가 하나도 없었다. 게다가 그 파일 입력창은 브라우저 기본 모양이라
   * 이 화면에서 유일하게 디자인 밖에 있는 컨트롤이었다.
   *
   * 카메라 배지를 아바타 모서리에 얹는다. 대화상자는 배지가 열고, 고르는 즉시 올라간다.
   *
   * 배지를 `<label>` 이 아니라 `<button>` 으로 두는 이유: label 은 포커스를 받지 못해
   * 키보드로 닿을 수 없다. 파일 입력은 감춰 두고 버튼이 눌러 준다.
   */
  const renderAvatar = (size: number, font: number, editable = false) => {
    const badge = Math.max(26, Math.round(size * 0.34));
    /*
      눌리는 면은 44px, 보이는 원은 그대로.

      globals.css 가 터치 기기에서 모든 버튼에 `min-height: 44px` 를 준다. 그 규칙의
      의도는 "시각 크기는 그대로 두고 눌리는 면만 넓힌다" 인데, 배경과 테두리가 있는
      이 배지에는 그대로 먹어서 26×44 짜리 흰 알약이 아바타를 덮었다(실측).

      그래서 버튼 자신을 44px 투명 판으로 두고, 보이는 원은 그 안의 span 이 맡는다.
      규칙을 끄지 않고 규칙이 원래 말한 모양이 된다. 데스크톱에서도 클릭 면이 넓어
      손해가 없다.
    */
    const hit = 44;
    const inset = (hit - badge) / 2;

    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div
          className="grid h-full w-full place-items-center overflow-hidden rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-highlight)] font-extrabold text-[color:var(--hc-text)]"
          style={{ fontSize: font }}
        >
          {user?.profileUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.profileUrl}
              alt="프로필 이미지"
              className="h-full w-full object-cover"
            />
          ) : (
            <span>{profileInitial}</span>
          )}
        </div>

        {editable ? (
          <>
            <input
              id="mypage-profile-image"
              ref={profileInputRef}
              type="file"
              accept={SUPPORTED_IMAGE_ACCEPT}
              onChange={(event) => void handleProfileFileChange(event)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => profileInputRef.current?.click()}
              disabled={isUploadingProfile}
              aria-label="프로필 이미지 바꾸기"
              title="프로필 이미지 바꾸기"
              className="group absolute grid place-items-center rounded-full focus-visible:outline-none disabled:opacity-60"
              style={{
                width: hit,
                height: hit,
                right: -inset,
                bottom: -inset,
              }}
            >
              {/* 테두리 색이 카드 바탕색이다 — 아바타와 배지 사이에 빈 틈을 만들어
                  둘이 한 덩어리로 뭉개지지 않게 한다.
                  포커스 링은 44px 투명 판이 아니라 보이는 원에 두른다. */}
              <span
                className="hc-button-icon grid place-items-center rounded-full border-2 border-[color:var(--hc-surface)] group-hover:bg-[color:var(--hc-icon-button-hover)] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[color:var(--hc-text)]"
                style={{ width: badge, height: badge }}
              >
                <Camera style={{ width: badge * 0.46, height: badge * 0.46 }} />
              </span>
            </button>
          </>
        ) : null}

        {editable && isUploadingProfile ? (
          <div
            role="status"
            aria-label="프로필 이미지 올리는 중"
            className="absolute inset-0 grid place-items-center rounded-full bg-[rgba(10,24,45,0.55)]"
          >
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
          </div>
        ) : null}
      </div>
    );
  };

  const statStrip = (
    <div className="flex flex-col gap-2">
      <div className="flex">
        {statCells.map((cell, i) => (
          <div
            key={cell.l}
            className={`flex-1 text-center ${i ? "border-l border-[color:var(--hc-border-subtle)]" : ""}`}
          >
            <div className="text-[21px] font-semibold tabular-nums">{cell.n}</div>
            <div className="mt-0.5 text-[12px] text-[color:var(--hc-muted)]">
              {cell.l}
            </div>
          </div>
        ))}
      </div>
      {statsError ? (
        <div className="flex flex-col items-center gap-1.5 px-4">
          <p className="text-center text-[11px] text-[color:var(--hc-muted)]">
            {statsError}
          </p>
          <button
            type="button"
            onClick={() => void fetchStats()}
            className="hc-button-secondary rounded-full border px-4 py-1.5 text-[11px] font-semibold"
          >
            다시 시도
          </button>
        </div>
      ) : null}
    </div>
  );

  /* ---------- 섹션 콘텐츠 (데스크톱 우측 / 모바일 펼침 공용) ---------- */

  /*
    계정 화면은 폼이 아니라 **목록**이다.

    예전에는 이 자리가 통째로 폼이었다 — 늘 열려 있는 닉네임 입력창, 못 고치는데도
    입력창 모양인 이메일, 그리고 언제나 펼쳐진 비밀번호 세 칸. 마이페이지에서 가장
    자주 하는 일은 "내 정보가 뭐였지" 확인인데 화면은 계속 채워 넣으라고 말했고,
    정작 지금 내 닉네임이 무엇인지는 입력창 안을 들여다봐야 알 수 있었다.

    지금은 값을 값으로 보여 주고 고치는 길만 곁에 둔다. 연필은 보이는 값을 고치고
    (기록 화면의 이름 고치기와 같은 표시), 버튼은 값이 아닌 일을 한다.
  */
  const accountSection = (
    <div className="flex flex-col divide-y divide-[color:var(--hc-border-subtle)]">
      <SettingRow
        label="닉네임"
        value={user?.username || "이름 없음"}
        inlineAction={
          <button
            type="button"
            onClick={() => {
              setNicknameError(null);
              setNicknameOpen(true);
            }}
            aria-label="닉네임 바꾸기"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--hc-muted)] transition hover:bg-[color:var(--hc-surface-highlight)] hover:text-[color:var(--hc-text)]"
          >
            <PencilLine className="h-3.5 w-3.5" />
          </button>
        }
      />

      {/* 이메일은 바꿀 수 없다. 예전에는 readOnly 입력창이라 눌러 보고서야 알았다 —
          고칠 수 없는 값이 입력창처럼 보이면 안 된다. */}
      <SettingRow
        label="이메일"
        value={user?.email ?? "—"}
        hint={`${loginPlatformLabel}${josa(loginPlatformLabel, "으로/로")} 로그인해요`}
      />

      {/* 소셜로 가입한 계정에는 비밀번호가 없다. 그 줄을 보여 주면 사용자는 "현재
          비밀번호"에 무엇을 넣을지 알 수 없고, 뭘 넣든 AUTH-008 로 실패한다. 스웨거도
          이 메뉴를 소셜 계정에 노출하지 말라고 못박는다
          (PATCH /api/harucut/change/password 설명). */}
      {canChangePassword ? (
        <SettingRow
          label="비밀번호"
          value={<span className="tracking-[0.2em]">••••••••</span>}
          action={
            <button
              type="button"
              onClick={() => {
                setPasswordError(null);
                setPasswordOpen(true);
              }}
              className="hc-button-secondary rounded-full border px-4 py-2 text-[13px] font-semibold"
            >
              바꾸기
            </button>
          }
        />
      ) : null}
    </div>
  );

  // 마케팅 수신 동의를 거둘 자리가 그동안 없었다. 알림 설정이 곧 여기 붙을 자리라
  // 같은 칸에 둔다 — 사용자가 "받을지 말지"를 찾는 곳이 한 군데여야 한다.
  const notifSection = <TermsConsentPanel />;

  const framesSection = (
    <div className="flex flex-col gap-3">
      {/* /theme와 같은 게이지를 써서 한도를 여기서도 바로 알 수 있게 한다. */}
      <FrameCapacityMeter
        plan={frameCapacity.plan}
        used={frameCapacity.used}
        remaining={frameCapacity.remaining}
        onUpgrade={() => router.push("/pricing")}
      />
      <button
        type="button"
        onClick={() => router.push("/theme")}
        className="hc-button-secondary h-11 self-start rounded-full border px-6 text-[13px] font-semibold"
      >
        내 프레임 관리
      </button>
    </div>
  );

  const prefSection = (
    <div className="flex flex-col gap-4">
      <ColorThemePreferencePanel />
      {/* 앱 안에서만 보인다. 브라우저에서는 아무것도 렌더하지 않는다. */}
      <NativeNotificationSetting />
      <p className="text-[13px] leading-5 text-[color:var(--hc-muted)]">
        화질·언어 설정은 순차적으로 추가될 예정이에요.
      </p>
    </div>
  );

  /**
   * 쿠폰을 등록한다.
   *
   * `applied === false` 는 **실패가 아니다.** 이미 유료 사용자라 지금 덮어쓰지 않고
   * 현재 구독이 끝난 뒤 시작하도록 예약한 것이다(lib/couponApi.ts). 두 경우의 안내가
   * 달라야 해서 문구를 갈라 놓는다 — "지금부터"와 "언제부터"는 사용자에게 다른 소식이다.
   */
  const handleRedeemCoupon = async () => {
    const code = couponCode.trim();
    if (!code || couponBusy) return;

    setCouponBusy(true);
    setCouponError(null);
    setCouponNotice(null);

    try {
      const result = await redeemCoupon(code);
      const tierName = getPlanDisplayName(result.grantTier) ?? result.grantTier;

      if (result.applied) {
        setCouponNotice(`${tierName} 플랜이 지금부터 적용됐어요.`);
      } else {
        const startsAt = parseServerDateTime(result.startsAt);
        setCouponNotice(
          startsAt
            ? `지금 쓰는 플랜이 끝나는 ${startsAt.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}부터 ${tierName} 플랜이 시작돼요.`
            : `지금 쓰는 플랜이 끝난 뒤 ${tierName} 플랜이 시작돼요.`,
        );
      }

      setCouponCode("");
    } catch (error) {
      console.error(error);
      setCouponError(
        getUserFacingApiErrorMessage(error, "쿠폰을 등록하지 못했어요."),
      );
      return;
    } finally {
      setCouponBusy(false);
    }

    /*
      화면 갱신은 **성공을 확정한 뒤 따로** 한다.

      등급·쿠폰 목록이 바뀌었으니 부제와 프레임 한도도 맞춰야 하는데, 이 조회를 위 try 안에
      두면 조회 하나가 실패했을 때 바깥 catch 로 떨어져 "쿠폰을 등록하지 못했어요" 가 뜬다.
      쿠폰은 이미 서버에 적용됐는데도 그렇다 — 사용자는 성공 안내와 실패 안내를 함께 보고,
      일회용 쿠폰을 다시 입력하려 든다.

      조회가 실패해도 쿠폰은 적용된 것이 맞다. 화면이 잠깐 옛 값을 보일 뿐이라 조용히 넘긴다.
    */
    await Promise.all([
      refreshUser().catch(() => undefined),
      loadStats().catch(() => undefined),
    ]);
  };

  const periodEnd = parseServerDateTime(subscription?.currentPeriodEnd);

  /*
    요금제 줄은 오래 "누르면 /pricing 으로 나가는" 링크였다. 펼칠 내용이 없었기 때문이다.
    지금은 있다 — 구독 만료일·자동갱신 여부(GET /api/auth/subscriptions)와 쿠폰 등록이다.
    특히 쿠폰은 결제가 닫힌 지금 **유료 등급을 얻는 유일한 길**이라 들어갈 자리가 있어야 한다.
    가격표로 나가는 길은 아래 버튼으로 남긴다.
  */
  const planSection = (
    <div className="flex flex-col gap-4">
      <div className="hc-surface-well rounded-2xl border px-4 py-3.5">
        <p className="text-[13px] font-bold">
          {planDisplayName}
          {planPriceSuffix}
        </p>
        {/* 만료일은 유료일 때만 온다(BASIC 이면 키 자체가 없다). 없으면 줄을 그리지 않는다 —
            "무기한"처럼 읽힐 빈 값을 두지 않는다. */}
        {periodEnd ? (
          <p className="mt-1 text-[12px] leading-[1.6] text-[color:var(--hc-muted)]">
            {subscription?.autoRenew === false || subscription?.status === "CANCELED"
              ? `${periodEnd.toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}까지 쓸 수 있어요. 자동 갱신은 꺼져 있어요.`
              : `${periodEnd.toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}에 갱신돼요.`}
          </p>
        ) : null}
        {subscription?.status === "PAST_DUE" ? (
          <p className="mt-1 text-[12px] font-medium text-[color:var(--hc-danger)]">
            정기 결제가 실패했어요. 결제 수단을 확인해 주세요.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="mypage-coupon-code"
          className="text-[13px] font-bold"
        >
          쿠폰 등록
        </label>
        <div className="flex gap-2">
          <input
            id="mypage-coupon-code"
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value)}
            // 서버가 대소문자·앞뒤 공백을 맞춰 주므로 여기서 강제로 대문자로 바꾸지 않는다.
            // 입력하는 대로 보이는 편이 오타를 찾기 쉽다.
            placeholder="쿠폰 코드"
            maxLength={32}
            disabled={couponBusy}
            className="hc-input h-11 min-w-0 flex-1 rounded-full border px-4 text-[13px] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleRedeemCoupon()}
            disabled={couponBusy || !couponCode.trim()}
            className="hc-button-primary h-11 shrink-0 rounded-full px-5 text-[13px] font-semibold disabled:opacity-50"
          >
            {couponBusy ? "등록 중" : "등록"}
          </button>
        </div>
        {couponError ? (
          <p role="alert" className="text-[12px] font-medium text-[color:var(--hc-danger)]">
            {couponError}
          </p>
        ) : null}
        {couponNotice ? (
          <p className="text-[12px] font-medium text-[color:var(--hc-primary-strong)]">
            {couponNotice}
          </p>
        ) : null}
      </div>

      {coupons.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-bold">등록한 쿠폰</p>
          <ul className="flex flex-col gap-1.5">
            {coupons.map((coupon) => (
              <li
                key={coupon.publicId}
                className="flex items-center justify-between gap-3 text-[12px]"
              >
                <span className="min-w-0 truncate text-[color:var(--hc-text)]">
                  {coupon.couponName}
                </span>
                {/* RESERVED 는 "아직 안 쓴 것"이 아니라 "다음 차례를 기다리는 것"이다.
                    그냥 '대기'라고 하면 사용자가 뭔가 더 해야 하는 줄 안다. */}
                <span className="shrink-0 text-[color:var(--hc-muted)]">
                  {coupon.status === "REDEEMED"
                    ? "적용 중"
                    : "다음 차례에 시작"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => router.push("/pricing")}
        className="hc-button-secondary h-11 self-start rounded-full border px-6 text-[13px] font-semibold"
      >
        요금제 보기
      </button>
    </div>
  );

  /**
   * 모든 섹션이 펼칠 본문을 갖는다. **Partial 이 아니다** — 새 섹션을 SectionId 에 더하면
   * 여기서 컴파일이 깨져야 한다. 예전에는 Partial 이라 본문 없는 섹션이 조용히
   * "누르면 나가는 줄"로 떨어졌고, 그 분기가 요금제에 본문이 생긴 뒤로도 남아 있었다.
   */
  const sectionBody: Record<SectionId, ReactElement> = {
    account: accountSection,
    plan: planSection,
    notif: notifSection,
    frames: framesSection,
    pref: prefSection,
  };

  /** 접힌 줄에서도 알 수 있어야 하는 값은 부제가 대신 말한다. */
  const sectionSub = (id: SectionId) => {
    if (id === "frames") return frameCapacityText;
    if (id === "plan") return `${planDisplayName}${planPriceSuffix}`;
    return SECTION_META[id].sub;
  };

  const logoutAndExit = (
    <>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isSubmitting}
        className="hc-button-secondary flex h-11 w-full items-center justify-center gap-2 rounded-full border text-[13px] font-semibold disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
        로그아웃
      </button>
      <button
        type="button"
        onClick={handleExit}
        disabled={isSubmitting}
        className="mx-auto mt-1 flex min-h-[44px] w-fit items-center px-2 text-[13px] text-[color:var(--hc-muted)] underline underline-offset-[3px] transition hover:text-[color:var(--hc-text)] disabled:opacity-50"
      >
        회원 탈퇴
      </button>
    </>
  );

  return (
    <main className="hc-page-app min-h-dvh pb-[calc(90px+env(safe-area-inset-bottom))] text-[color:var(--hc-text)] lg:pb-0">
      <AppNav userInitial={user?.username} />

      {/* 한 칸이므로 폭을 좁힌다. 예전 1000px 는 좌우 두 칸이 나눠 쓰던 폭이라,
          그대로 두면 「비밀번호」 라벨과 오른쪽 「바꾸기」가 800px 넘게 떨어져
          한 줄로 읽히지 않는다. */}
      <div className="mx-auto w-full max-w-[680px] px-4 py-5 sm:py-6 lg:py-8">
        <h1 className="text-[28px] font-extrabold tracking-tight lg:text-[34px]">
          마이페이지
        </h1>

        {notice ? (
          <div
            role="status"
            className={
              notice.kind === "ok"
                ? "hc-feedback mt-3 rounded-2xl border px-4 py-3 text-[12px]"
                : "mt-3 rounded-2xl border border-[color:var(--hc-danger-border)] bg-[color:var(--hc-danger-soft-bg)] px-4 py-3 text-[12px] text-[color:var(--hc-danger)]"
            }
          >
            {notice.text}
          </div>
        ) : null}

        {loadError ? (
          <p
            role="alert"
            className="mt-3 text-[12px] text-[color:var(--hc-danger)]"
          >
            {loadError}
          </p>
        ) : null}

        {loading ? (
          <div className="hc-surface-card mt-5 rounded-[20px] border p-5">
            <p className="text-[12px] text-[color:var(--hc-muted)]">
              정보를 불러오는 중…
            </p>
          </div>
        ) : !user ? (
          <div className="hc-surface-card mt-5 rounded-[20px] border p-5">
            <p className="text-[12px] text-[color:var(--hc-muted)]">
              내 정보를 불러오지 못했어요.
            </p>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-5">
            {/* 프로필 — 아바타·이름·이메일 한 줄 */}
            <div className="flex items-center gap-4 px-0.5">
              {renderAvatar(72, 28, true)}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[18px] font-extrabold">
                  {user.username}
                </div>
                <div className="truncate text-[13px] text-[color:var(--hc-muted)]">
                  {user.email}
                </div>
              </div>
            </div>

            <div className="hc-surface-card rounded-[20px] border py-4">
              {statStrip}
            </div>

            {/* 섹션끼리는 바깥 간격보다 좁게 둔다. 프로필·스탯과 같은 20px 를 주면
                다섯 장이 각자 떠 있는 것처럼 보여 한 목록으로 읽히지 않았다. */}
            <div className="flex flex-col gap-3">
            {SECTIONS.map((id) => {
              const meta = SECTION_META[id];
              const body = sectionBody[id];
              const bodyId = `mypage-section-${id}`;
              const open = openMobile === id;

              return (
                <section
                  key={id}
                  className="hc-surface-card overflow-hidden rounded-[20px] border"
                >
                  {/*
                    넓은 화면에서는 늘 펼쳐 두고, 좁은 화면에서는 접는다. 여는 여부를
                    JS(`isDesktop`)로 정하지 않고 CSS 로 가른다 — 뷰포트를 재는 값은
                    첫 렌더에 항상 false 라, JS 로 정하면 데스크톱에서 접힌 채 한 번
                    그려졌다 펴지는 깜빡임이 생긴다.
                  */}
                  <h2 className="hidden px-5 pt-5 text-[17px] font-extrabold lg:block">
                    {meta.title}
                  </h2>

                  <h2 className="lg:hidden">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={bodyId}
                      onClick={() =>
                        setOpenMobile((prev) => (prev === id ? null : id))
                      }
                      // 헤딩의 이름은 제목만. 부제까지 한 이름으로 읽히면 「계정 정보이메일, 닉네임…」이 된다.
                      aria-label={meta.title}
                      aria-describedby={`${bodyId}-sub`}
                      className="flex w-full items-center gap-3.5 px-5 py-4 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold">
                          {meta.title}
                        </span>
                        <span
                          id={`${bodyId}-sub`}
                          className="block truncate text-[12px] font-normal text-[color:var(--hc-muted)]"
                        >
                          {sectionSub(id)}
                        </span>
                      </span>
                      <ChevronRight
                        className="h-[18px] w-[18px] shrink-0 text-[color:var(--hc-muted)] transition-transform"
                        style={open ? { transform: "rotate(90deg)" } : undefined}
                      />
                    </button>
                  </h2>

                  <div
                    id={bodyId}
                    className={`${
                      open
                        ? "border-t border-[color:var(--hc-border-subtle)]"
                        : "hidden"
                    } px-5 py-5 lg:block lg:border-t-0 lg:pt-3`}
                  >
                    {body}
                  </div>
                </section>
              );
            })}
            </div>

            <div className="mt-1">{logoutAndExit}</div>

            <p className="pb-2 text-center text-[11px] text-[color:var(--hc-muted)]">
              하루컷 v1.0.0
            </p>
          </div>
        )}
      </div>
      <MobileTabBar />

      {nicknameOpen ? (
        <SingleFieldDialog
          title="닉네임 바꾸기"
          label="닉네임"
          placeholder="닉네임을 입력해 주세요"
          initialValue={user?.username ?? ""}
          maxLength={20}
          saving={savingNickname}
          error={nicknameError}
          onClose={closeNickname}
          onSubmit={(next) => void handleChangeUsername(next)}
        />
      ) : null}

      {passwordOpen ? (
        <PasswordChangeDialog
          saving={savingPassword}
          error={passwordError}
          onClose={closePassword}
          onSubmit={(values) => void handleChangePassword(values)}
        />
      ) : null}
    </main>
  );
}
