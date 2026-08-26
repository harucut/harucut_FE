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
import {
  Bell,
  Camera,
  ChevronRight,
  CreditCard,
  Image as ImageIcon,
  LogOut,
  PencilLine,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
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
import { ColorThemePreferencePanel } from "@/components/theme/ColorThemePreferencePanel";
import { TermsConsentPanel } from "@/components/terms/TermsConsentPanel";
import { getPlanDisplayName } from "@/constants/plans";
import { resolvePlanInfo } from "@/constants/planLimits";
import type { SubscriptionUsage } from "@/lib/api-types";
import { clientApi } from "@/lib/clientApi";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { uploadProfileImage } from "@/lib/profileImageApi";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";
import {
  getMyUserInfo,
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

// 메뉴 구성은 핸드오프(app/web)와 동일한 순서·아이콘을 따른다.
const SECTION_META: Record<
  SectionId,
  { icon: typeof User; title: string; sub: string }
> = {
  account: {
    icon: User,
    title: "계정 정보",
    sub: "이메일, 닉네임, 비밀번호 변경",
  },
  plan: { icon: Sparkles, title: "요금제", sub: "플랜 및 결제 관리" },
  notif: {
    icon: Bell,
    title: "알림·약관 동의",
    sub: "마케팅 수신 동의, 푸시",
  },
  frames: { icon: ImageIcon, title: "내 프레임", sub: "보관한 프레임" },
  pref: { icon: Settings, title: "설정", sub: "화질, 언어" },
};

// 데스크톱 사이드바에 노출하는 섹션(요금제는 별도 라우트로 이동)
const SIDEBAR_SECTIONS: SectionId[] = ["account", "notif", "frames", "pref"];
// 앱(모바일) 레이아웃의 메뉴 행 순서
const MOBILE_SECTIONS: SectionId[] = [
  "account",
  "plan",
  "notif",
  "frames",
  "pref",
];

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

  // 데스크톱: 우측 콘텐츠 섹션 / 모바일: 펼쳐진 메뉴 행
  const [section, setSection] = useState<SectionId>("account");
  const [openMobile, setOpenMobile] = useState<SectionId | null>(null);

  // 데스크톱/모바일 레이아웃을 CSS로만 숨기면 같은 섹션 폼(동일 id)이 양쪽에
  // 동시에 마운트된다. 뷰포트에 따라 한 쪽만 렌더해 중복 마운트를 막는다.
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

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
      const [media, frames, nextUsage] = await Promise.all([
        listMyMedia(),
        listMyFrames(),
        // 구독 사용량은 못 받아도 목록 개수로 폴백하므로 실패를 무시한다.
        getSubscriptionUsage().catch(() => null),
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
      // uploadProfileImage 는 형식·용량을 자기 문구로 던진다. 그걸 살린다.
      setNotice({
        kind: "error",
        text:
          error instanceof Error && error.message
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

  // 서버 등급(BASIC/PLUS/PRO) 대신 요금제 카드 이름(Free/Plus/Pro)으로 보여준다.
  const planDisplayName = getPlanDisplayName(user?.planTier) ?? "Free";
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

  // 핸드오프 색상: 메뉴 아이콘은 초록 틴트 위 초록 아이콘
  const iconTint =
    "color-mix(in srgb, var(--hc-primary) 14%, transparent)" as const;

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
          className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-[color:var(--hc-primary)] font-extrabold text-[color:var(--hc-primary-contrast)]"
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

  const planSection = (
    <div className="flex flex-col gap-3">
      <div className="hc-surface-well grid gap-2 rounded-2xl border p-4 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-2 text-[color:var(--hc-muted)]">
            <CreditCard className="h-4 w-4 text-[color:var(--hc-primary-strong)]" />
            <span className="text-[11px]">현재 플랜</span>
          </div>
          <p className="mt-1.5 text-[15px] font-bold">
            {planDisplayName}
            {planPriceSuffix}
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 text-[color:var(--hc-muted)]">
            <User className="h-4 w-4 text-[color:var(--hc-primary-strong)]" />
            <span className="text-[11px]">로그인 플랫폼</span>
          </div>
          <p className="mt-1.5 text-[15px] font-bold">
            {getLoginPlatformLabel(user?.loginPlatform)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => router.push("/pricing")}
        className="hc-button-primary h-11 self-start rounded-full px-6 text-[13px] font-semibold"
      >
        요금제 보기
      </button>
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
      <p className="text-[13px] leading-5 text-[color:var(--hc-muted)]">
        화질·언어 설정은 순차적으로 추가될 예정이에요.
      </p>
    </div>
  );

  const sectionTitle: Record<SectionId, string> = {
    account: "계정 정보",
    plan: "요금제",
    notif: "알림·약관 동의",
    frames: "내 프레임",
    pref: "설정",
  };

  const sectionBody: Record<SectionId, ReactElement> = {
    account: accountSection,
    plan: planSection,
    notif: notifSection,
    frames: framesSection,
    pref: prefSection,
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
        className="mx-auto mt-3 block text-[13px] text-[color:var(--hc-muted)] underline underline-offset-[3px] transition hover:text-[color:var(--hc-text)] disabled:opacity-50"
      >
        회원 탈퇴
      </button>
    </>
  );

  return (
    <main className="hc-page-app min-h-dvh pb-[calc(90px+env(safe-area-inset-bottom))] text-[color:var(--hc-text)] lg:pb-0">
      <AppNav userInitial={user?.username} />

      <div className="mx-auto w-full max-w-[1000px] px-4 py-5 sm:py-6 lg:py-8">
        <h1 className="text-[28px] font-extrabold tracking-tight lg:mb-7 lg:text-[34px]">
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
              정보를 불러오는 중...
            </p>
          </div>
        ) : !user ? (
          <div className="hc-surface-card mt-5 rounded-[20px] border p-5">
            <p className="text-[12px] text-[color:var(--hc-muted)]">
              내 정보를 불러오지 못했어요.
            </p>
          </div>
        ) : (
          <>
            {/* ===== 데스크톱 (lg+) : 260px 사이드바 + 우측 콘텐츠 ===== */}
            {isDesktop ? (
            <div className="mt-2 hidden items-start gap-8 lg:grid lg:grid-cols-[260px_1fr]">
              {/* 사이드바 */}
              <div>
                <div className="hc-surface-card mb-4 rounded-[20px] border p-6 text-center">
                  {/* flex 로 가운데를 잡는다. `mx-auto` 는 여기서 아무 일도 하지
                      않았다 — 감싼 div 가 폭이 꽉 찬 블록이라 좌우 여백이 애초에
                      0이었고, 아바타만 왼쪽 끝에 붙어 아래 이름·이메일·스탯이
                      가운데인 카드에서 혼자 어긋나 있었다. */}
                  <div className="mb-3.5 flex justify-center">
                    {renderAvatar(80, 30, true)}
                  </div>
                  <div className="text-[18px] font-extrabold">
                    {user.username}
                  </div>
                  <div className="mt-1 truncate text-[12px] text-[color:var(--hc-muted)]">
                    {user.email}
                  </div>
                  <div className="mt-4 border-t border-[color:var(--hc-border-subtle)] pt-4">
                    {statStrip}
                  </div>
                </div>

                <div className="hc-surface-card overflow-hidden rounded-[20px] border">
                  {SIDEBAR_SECTIONS.map((id, i) => {
                    const meta = SECTION_META[id];
                    const Icon = meta.icon;
                    const active = section === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSection(id)}
                        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${i ? "border-t border-[color:var(--hc-border-subtle)]" : ""}`}
                        style={active ? { background: iconTint } : undefined}
                      >
                        <Icon
                          className="h-[19px] w-[19px]"
                          style={{
                            color: active
                              ? "var(--hc-primary)"
                              : "var(--hc-muted)",
                          }}
                        />
                        <span
                          className="text-[14px] font-bold"
                          style={{
                            color: active
                              ? "var(--hc-primary-strong)"
                              : "var(--hc-text)",
                          }}
                        >
                          {meta.title}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">{logoutAndExit}</div>
              </div>

              {/* 우측 콘텐츠 카드 */}
              <div className="hc-surface-card rounded-[20px] border p-8">
                <h2 className="mb-6 text-[21px] font-extrabold">
                  {sectionTitle[section]}
                </h2>
                {sectionBody[section]}
              </div>
            </div>
            ) : null}

            {/* ===== 모바일/태블릿 (<lg) : 앱 MyPage 레이아웃 ===== */}
            {!isDesktop ? (
            <div className="mt-4 flex flex-col gap-5 lg:hidden">
              {/* 프로필 */}
              <div className="flex items-center gap-4 px-0.5 pb-1">
                {renderAvatar(64, 24, true)}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[18px] font-extrabold">
                    {user.username}
                  </div>
                  <div className="truncate text-[13px] text-[color:var(--hc-muted)]">
                    {user.email}
                  </div>
                </div>
              </div>

              {/* 스탯 3셀 */}
              <div className="hc-surface-card rounded-[20px] border py-4">
                {statStrip}
              </div>

              {/* 그룹 메뉴 행 */}
              <div className="hc-surface-card overflow-hidden rounded-[20px] border">
                {MOBILE_SECTIONS.map((id, i) => {
                  const meta = SECTION_META[id];
                  const Icon = meta.icon;
                  const isOpen = openMobile === id;
                  return (
                    <div
                      key={id}
                      className={
                        i
                          ? "border-t border-[color:var(--hc-border-subtle)]"
                          : ""
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (id === "plan") {
                            router.push("/pricing");
                            return;
                          }
                          setOpenMobile((prev) => (prev === id ? null : id));
                        }}
                        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
                      >
                        <span
                          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl"
                          style={{ background: iconTint }}
                        >
                          <Icon className="h-[19px] w-[19px] text-[color:var(--hc-primary-strong)]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold">
                            {meta.title}
                          </span>
                          <span className="block truncate text-[12px] text-[color:var(--hc-muted)]">
                            {id === "frames"
                              ? frameCapacityText
                              : id === "plan"
                                ? `${planDisplayName}${planPriceSuffix}`
                                : meta.sub}
                          </span>
                        </span>
                        <ChevronRight
                          className="h-[18px] w-[18px] shrink-0 text-[color:var(--hc-muted)] transition-transform"
                          style={
                            isOpen ? { transform: "rotate(90deg)" } : undefined
                          }
                        />
                      </button>
                      {isOpen && id !== "plan" ? (
                        <div className="border-t border-[color:var(--hc-border-subtle)] px-4 py-5">
                          {sectionBody[id]}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* 로그아웃 / 탈퇴 */}
              <div className="mt-1">{logoutAndExit}</div>

              <p className="pb-2 text-center text-[11px] text-[color:var(--hc-muted)]">
                하루컷 v1.0.0
              </p>
            </div>
            ) : null}
          </>
        )}
      </div>
      <MobileTabBar />

      {/* 조건부로 붙였다 뗀다 — 열 때마다 새로 마운트돼야 입력창이 그때의 값에서
          시작하고, 닫을 때 포커스가 열었던 버튼으로 돌아온다. */}
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
