"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactElement,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronRight,
  CreditCard,
  Image as ImageIcon,
  LogOut,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import { AuthField } from "@/components/auth/AuthField";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { ColorThemePreferencePanel } from "@/components/theme/ColorThemePreferencePanel";
import { clientApi } from "@/lib/clientApi";
import { uploadProfileImage } from "@/lib/profileImageApi";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";
import { listMyMedia } from "@/lib/userMediaApi";
import { listMyFrames } from "@/lib/remoteFrameApi";

type Errors = {
  common?: string | null;
  username?: string | null;
  oldPassword?: string | null;
  newPassword?: string | null;
  confirmPassword?: string | null;
};

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
  notif: { icon: Bell, title: "알림 설정", sub: "푸시, 주간 리마인더" },
  frames: { icon: ImageIcon, title: "내 프레임", sub: "보관한 프레임" },
  pref: { icon: Settings, title: "설정", sub: "화질, 워터마크, 언어" },
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
  const [errors, setErrors] = useState<Errors>({});

  const [username, setUsername] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);

  const [stats, setStats] = useState<Stats>({
    total: 0,
    thisMonth: 0,
    frames: 0,
  });

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

  const fetchUser = async () => {
    setLoading(true);
    setErrors({});

    try {
      const nextUser = await getMyUserInfo();
      setUser(nextUser);
      setUsername(nextUser.username || "");
    } catch (error) {
      console.error(error);
      setErrors({
        common: "내 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setLoading(false);
    }
  };

  // 스탯 3셀은 우리 실제 데이터(기록 미디어 / 이번 달 / 보관 프레임)로 매핑한다.
  const fetchStats = async () => {
    try {
      const [media, frames] = await Promise.all([
        listMyMedia().catch(() => []),
        listMyFrames().catch(() => []),
      ]);

      const now = new Date();
      const thisMonth = media.filter((item) => {
        if (!item.createdAt) return false;
        const created = new Date(item.createdAt);
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
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void fetchUser();
    void fetchStats();
  }, []);

  const handleChangeUsername = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const nextUsername = username.trim();
    if (!nextUsername) {
      setErrors({ username: "닉네임을 입력해 주세요." });
      setIsSubmitting(false);
      return;
    }

    try {
      await clientApi.patch("/api/client/user/username", {
        username: nextUsername,
      });
      setUser((prev) => (prev ? { ...prev, username: nextUsername } : prev));
      alert("닉네임이 변경되었어요.");
    } catch (error) {
      console.error(error);
      setErrors({ common: "닉네임 변경에 실패했어요." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    if (!oldPassword) {
      setErrors({ oldPassword: "현재 비밀번호를 입력해 주세요." });
      setIsSubmitting(false);
      return;
    }

    if (!newPassword) {
      setErrors({ newPassword: "새 비밀번호를 입력해 주세요." });
      setIsSubmitting(false);
      return;
    }

    if (newPassword.length < 8) {
      setErrors({ newPassword: "비밀번호는 8자 이상으로 설정해 주세요." });
      setIsSubmitting(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: "새 비밀번호가 서로 일치하지 않아요." });
      setIsSubmitting(false);
      return;
    }

    try {
      await clientApi.patch("/api/client/auth/password/change", {
        oldPassword,
        newPassword,
      });
      alert("비밀번호가 변경되었어요.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error(error);
      setErrors({ common: "비밀번호 변경에 실패했어요." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProfileFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setProfileFile(e.target.files?.[0] ?? null);
  };

  const handleUploadProfileImage = async () => {
    if (!profileFile) {
      setErrors({ common: "업로드할 이미지를 선택해 주세요." });
      return;
    }

    setErrors({});
    setIsUploadingProfile(true);

    try {
      await uploadProfileImage(profileFile);
      await fetchUser();
      setProfileFile(null);
      alert("프로필 이미지가 변경되었어요.");
    } catch (error) {
      console.error(error);
      setErrors({ common: "프로필 이미지 업로드에 실패했어요." });
    } finally {
      setIsUploadingProfile(false);
    }
  };

  const handleLogout = async () => {
    setErrors({});
    setIsSubmitting(true);

    try {
      await clientApi.delete("/api/client/logout");
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setErrors({ common: "로그아웃에 실패했어요." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExit = async () => {
    const ok = confirm(
      "정말 탈퇴하시겠어요?\n탈퇴 신청일부터 30일 내로 다시 로그인하면 계정을 복구할 수 있어요.",
    );
    if (!ok) return;

    setErrors({});
    setIsSubmitting(true);

    try {
      await clientApi.delete("/api/client/exit");
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setErrors({ common: "회원 탈퇴에 실패했어요." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const profileInitial = user?.username?.trim()?.[0] ?? "U";

  const statCells = useMemo(
    () =>
      [
        { n: stats.total, l: "총 기록" },
        { n: stats.thisMonth, l: "이번 달" },
        { n: stats.frames, l: "보관 프레임" },
      ] as const,
    [stats],
  );

  // 핸드오프 색상: 메뉴 아이콘은 초록 틴트 위 초록 아이콘
  const iconTint =
    "color-mix(in srgb, var(--hc-primary) 14%, transparent)" as const;

  const renderAvatar = (size: number, font: number) => (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-[color:var(--hc-primary)] font-extrabold text-[color:var(--hc-primary-contrast)]"
      style={{ width: size, height: size, fontSize: font }}
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
  );

  const statStrip = (
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
  );

  /* ---------- 섹션 콘텐츠 (데스크톱 우측 / 모바일 펼침 공용) ---------- */

  const accountSection = (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleChangeUsername} className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-[color:var(--hc-muted)]">
          닉네임
        </label>
        <div className="flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="hc-input h-11 flex-1 rounded-xl border px-3.5 text-[14px] outline-none"
            placeholder="닉네임을 입력해 주세요"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="hc-button-primary h-11 rounded-full px-5 text-[13px] font-semibold disabled:opacity-50"
          >
            저장
          </button>
        </div>
        {errors.username ? (
          <p className="text-[11.5px] text-[color:var(--hc-primary-strong)]">
            {errors.username}
          </p>
        ) : null}
      </form>

      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-[color:var(--hc-muted)]">
          이메일
        </label>
        <input
          value={user?.email ?? ""}
          readOnly
          className="hc-input h-11 w-full cursor-default rounded-xl border px-3.5 text-[14px] text-[color:var(--hc-muted)] outline-none"
        />
      </div>

      <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
        <AuthField
          id="oldPassword"
          name="oldPassword"
          type="password"
          label="현재 비밀번호"
          placeholder="현재 비밀번호를 입력해 주세요"
          autoComplete="current-password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          error={errors.oldPassword}
        />
        <AuthField
          id="newPassword"
          name="newPassword"
          type="password"
          label="새 비밀번호"
          placeholder="새 비밀번호를 입력해 주세요"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={errors.newPassword}
        />
        <AuthField
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          label="새 비밀번호 확인"
          placeholder="새 비밀번호를 한 번 더 입력해 주세요"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="hc-button-primary mt-1 h-11 self-start rounded-full px-6 text-[13px] font-semibold disabled:opacity-50"
        >
          {isSubmitting ? "변경 중..." : "변경사항 저장"}
        </button>
      </form>

      <div className="flex flex-col gap-2 border-t border-[color:var(--hc-border-subtle)] pt-5">
        <label className="text-[13px] font-semibold text-[color:var(--hc-muted)]">
          프로필 이미지
        </label>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept={SUPPORTED_IMAGE_ACCEPT}
            onChange={handleProfileFileChange}
            disabled={isUploadingProfile}
            className="block w-full text-[12px] text-[color:var(--hc-muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[color:var(--hc-surface-muted)] file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-[color:var(--hc-text)] hover:file:bg-[color:var(--hc-surface-muted-hover)]"
          />
          <button
            type="button"
            onClick={handleUploadProfileImage}
            disabled={isUploadingProfile || !profileFile}
            className="hc-button-primary h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[12px] font-semibold disabled:opacity-50"
          >
            {isUploadingProfile ? "업로드 중" : "업로드"}
          </button>
        </div>
      </div>
    </div>
  );

  const planSection = (
    <div className="flex flex-col gap-3">
      <div className="hc-surface-well grid gap-2 rounded-2xl border p-4 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-2 text-[color:var(--hc-muted)]">
            <CreditCard className="h-4 w-4 text-[color:var(--hc-primary)]" />
            <span className="text-[11.5px]">현재 플랜</span>
          </div>
          <p className="mt-1.5 text-[15px] font-bold">
            {user?.planTier ?? "BASIC"}
            {user?.monthlyPrice
              ? ` · 월 ${user.monthlyPrice.toLocaleString("ko-KR")}원`
              : ""}
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 text-[color:var(--hc-muted)]">
            <User className="h-4 w-4 text-[color:var(--hc-primary)]" />
            <span className="text-[11.5px]">로그인 플랫폼</span>
          </div>
          <p className="mt-1.5 text-[15px] font-bold">
            {user?.loginPlatform ?? "HARUCUT"}
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

  const notifSection = (
    <p className="text-[13px] leading-6 text-[color:var(--hc-muted)]">
      알림 설정은 곧 제공될 예정이에요. 주간 리마인더와 좋아요 알림을 이곳에서
      관리할 수 있게 준비하고 있어요.
    </p>
  );

  const framesSection = (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-[color:var(--hc-muted)]">
        보관한 프레임 {stats.frames}개
      </p>
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
      <p className="text-[12.5px] leading-5 text-[color:var(--hc-muted)]">
        화질·워터마크·언어 설정은 순차적으로 추가될 예정이에요.
      </p>
    </div>
  );

  const sectionTitle: Record<SectionId, string> = {
    account: "계정 정보",
    plan: "요금제",
    notif: "알림 설정",
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
        className="mx-auto mt-3 block text-[12.5px] text-[color:var(--hc-muted)] underline underline-offset-[3px] transition hover:text-[color:var(--hc-text)] disabled:opacity-50"
      >
        회원 탈퇴
      </button>
    </>
  );

  return (
    <main className="hc-page-app min-h-dvh pb-[90px] text-[color:var(--hc-text)] lg:pb-0">
      <AppNav userInitial={user?.username} />

      <div className="mx-auto w-full max-w-[1000px] px-4 py-5 sm:py-6 lg:py-8">
        <h1 className="text-[28px] font-extrabold tracking-tight lg:mb-7 lg:text-[34px]">
          마이페이지
        </h1>

        {errors.common ? (
          <p className="mt-3 text-[12px] text-[color:var(--hc-primary-strong)]">
            {errors.common}
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
                  <div className="mx-auto mb-3.5">{renderAvatar(80, 30)}</div>
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
                {renderAvatar(64, 24)}
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
                          <Icon className="h-[19px] w-[19px] text-[color:var(--hc-primary)]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-bold">
                            {meta.title}
                          </span>
                          <span className="block truncate text-[12px] text-[color:var(--hc-muted)]">
                            {id === "frames"
                              ? `보관한 프레임 ${stats.frames}개`
                              : id === "plan"
                                ? `${user.planTier ?? "BASIC"}${user.monthlyPrice ? ` · 월 ${user.monthlyPrice.toLocaleString("ko-KR")}원` : ""}`
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

              <p className="pb-2 text-center text-[11px] text-[color:var(--hc-muted-soft)]">
                하루컷 v1.0.0
              </p>
            </div>
            ) : null}
          </>
        )}
      </div>
      <MobileTabBar />
    </main>
  );
}
