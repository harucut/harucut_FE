"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  LogOut,
  Palette,
  Plus,
  RefreshCw,
  Settings2,
  User as UserIcon,
} from "lucide-react";
import { AuthField } from "@/components/auth/AuthField";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { ColorThemePreferencePanel } from "@/components/theme/ColorThemePreferencePanel";
import { FramePreview } from "@/components/frame/FramePreview";
import { ApiRequestError, clientApi } from "@/lib/clientApi";
import { buildPathWithRedirect } from "@/lib/redirect";
import { uploadProfileImage } from "@/lib/profileImageApi";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";
import { listMyMedia } from "@/lib/userMediaApi";
import { listMyFrames } from "@/lib/remoteFrameApi";
import { frameIdFromFrameType } from "@/lib/frameApi";
import type { RemoteFrame } from "@/lib/api-types";

type Errors = {
  common?: string | null;
  username?: string | null;
  oldPassword?: string | null;
  newPassword?: string | null;
  confirmPassword?: string | null;
};

type SectionId = "account" | "frames" | "theme" | "pref";

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

  const [totalCuts, setTotalCuts] = useState<number | null>(null);
  const [frames, setFrames] = useState<RemoteFrame[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  // 로드 실패를 빈 목록과 구분한다(실패를 0으로 삼키지 않기).
  const [framesError, setFramesError] = useState(false);

  // 섹션 전환: 데스크톱(≥lg)은 사이드바+콘텐츠를 항상 함께,
  // 모바일(<lg)은 메뉴 목록 ↔ 상세를 오가는 앱 스타일 내비게이션.
  const [section, setSection] = useState<SectionId>("account");
  const [mobileView, setMobileView] = useState<"menu" | "detail">("menu");

  const loadStats = async () => {
    setStatsLoading(true);
    setFramesError(false);
    const [mediaRes, framesRes] = await Promise.allSettled([
      listMyMedia(),
      listMyFrames(),
    ]);
    // 미디어(총 컷): 실패 시 null로 두어 '–'를 표시(0으로 오인 금지).
    setTotalCuts(mediaRes.status === "fulfilled" ? mediaRes.value.length : null);
    // 프레임: 실패와 빈 목록을 구분. 실패면 오류 상태로 두고 목록은 비우지 않음.
    if (framesRes.status === "fulfilled") {
      setFrames(framesRes.value);
    } else {
      console.error(framesRes.reason);
      setFramesError(true);
    }
    setStatsLoading(false);
  };

  const fetchUser = async () => {
    setLoading(true);
    setErrors({});

    try {
      const nextUser = await getMyUserInfo();
      setUser(nextUser);
      setUsername(nextUser.username || "");
      void loadStats();
    } catch (error) {
      // 세션 만료/무효(401)면 에러를 보여주지 말고 로그인 페이지로 보낸다
      if (error instanceof ApiRequestError && error.status === 401) {
        router.replace(buildPathWithRedirect("/login", "/mypage"));
        return;
      }
      console.error(error);
      setErrors({
        common: "내 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const profileInitial = user?.username?.trim()?.[0]?.toUpperCase() ?? "U";

  const MENU: {
    id: SectionId;
    label: string;
    desc: string;
    icon: typeof UserIcon;
  }[] = [
    {
      id: "account",
      label: "계정 정보",
      desc: "닉네임 · 이메일 · 비밀번호",
      icon: UserIcon,
    },
    {
      id: "frames",
      label: "내 프레임",
      desc: statsLoading
        ? "불러오는 중..."
        : framesError
          ? "불러오지 못했어요"
          : `보관한 프레임 ${frames.length}개`,
      icon: ImageIcon,
    },
    { id: "theme", label: "테마", desc: "다크 · 라이트", icon: Palette },
    {
      id: "pref",
      label: "환경 설정",
      desc: "저장 화질 · 워터마크 · 언어",
      icon: Settings2,
    },
  ];

  const openSection = (id: SectionId) => {
    setSection(id);
    setMobileView("detail");
  };

  return (
    <main className="hc-page-app min-h-dvh pb-[90px] text-[color:var(--hc-text)] lg:pb-0">
      <AppNav userInitial={user?.username} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:py-6 lg:gap-7 lg:py-8">
        <header className="flex items-center justify-between pt-1 lg:pt-2">
          <h1 className="text-[28px] font-extrabold tracking-tight lg:text-[34px]">
            마이페이지
          </h1>
          <button
            type="button"
            onClick={fetchUser}
            disabled={isSubmitting || loading}
            className="hc-button-icon grid h-10 w-10 place-items-center rounded-full border disabled:opacity-50"
            aria-label="새로고침"
            title="새로고침"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </header>

        {errors.common ? (
          <p className="text-[12px] text-[color:var(--hc-primary-strong)]">
            {errors.common}
          </p>
        ) : null}

        {loading ? (
          <div className="hc-surface-card rounded-[20px] border p-5">
            <p className="text-[12px] text-[color:var(--hc-muted)]">
              정보를 불러오는 중...
            </p>
          </div>
        ) : user ? (
          <div className="lg:grid lg:grid-cols-[260px_1fr] lg:items-start lg:gap-8">
            {/* 사이드바(데스크톱) / 메뉴(모바일) */}
            <aside
              className={`${mobileView === "detail" ? "hidden" : "flex"} flex-col gap-4 lg:flex`}
            >
              {/* 프로필 카드 */}
              <section className="hc-surface-card rounded-[24px] border p-5 text-center">
                <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-[color:var(--hc-primary)] text-[28px] font-extrabold text-[color:var(--hc-primary-contrast)]">
                  {user.profileUrl ? (
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
                <p className="mt-3.5 truncate text-[18px] font-extrabold">
                  {user.username}
                </p>
                <p className="truncate text-[13px] text-[color:var(--hc-muted)]">
                  {user.email}
                </p>

                {/* 스탯 */}
                <div className="mt-4 flex border-t border-[color:var(--hc-border-subtle)] pt-4">
                  <div className="flex-1">
                    <div className="text-[20px] font-extrabold tabular-nums">
                      {totalCuts ?? "–"}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-[color:var(--hc-muted)]">
                      총 네 컷
                    </div>
                  </div>
                  <div className="flex-1 border-l border-[color:var(--hc-border-subtle)]">
                    <div className="text-[20px] font-extrabold tabular-nums">
                      {statsLoading || framesError ? "–" : frames.length}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-[color:var(--hc-muted)]">
                      보관 프레임
                    </div>
                  </div>
                </div>
              </section>

              {/* 메뉴 */}
              <nav className="hc-surface-card overflow-hidden rounded-[20px] border">
                {MENU.map((item, i) => {
                  const active = section === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openSection(item.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition ${
                        i ? "border-t border-[color:var(--hc-border-subtle)]" : ""
                      } ${active ? "bg-[color:var(--hc-surface-highlight)]" : "hover:bg-[color:var(--hc-surface-muted)]"}`}
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                          active
                            ? "bg-[color:var(--hc-primary)] text-[color:var(--hc-primary-contrast)]"
                            : "bg-[color:var(--hc-surface-muted)] text-[color:var(--hc-muted)]"
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-bold">
                          {item.label}
                        </span>
                        <span className="block truncate text-[11.5px] text-[color:var(--hc-muted)]">
                          {item.desc}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--hc-muted-soft)] lg:hidden" />
                    </button>
                  );
                })}
              </nav>

              {/* 로그아웃 / 탈퇴 */}
              <div className="hc-surface-card rounded-[20px] border p-4">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isSubmitting}
                  className="hc-button-secondary flex h-10 w-full items-center justify-center gap-2 rounded-full border text-[12px] font-semibold disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </button>
                <button
                  type="button"
                  onClick={handleExit}
                  disabled={isSubmitting}
                  className="mx-auto mt-3 block text-[12px] font-semibold text-[color:var(--hc-muted-soft)] underline underline-offset-4 transition hover:text-[color:var(--hc-text)] disabled:opacity-50"
                >
                  회원 탈퇴
                </button>
              </div>

              <p className="pb-2 text-center text-[11px] text-[color:var(--hc-muted-soft)]">
                하루컷 v1.0.0
              </p>
            </aside>

            {/* 콘텐츠 패널 */}
            <div
              className={`${mobileView === "menu" ? "hidden" : "block"} lg:block`}
            >
              <button
                type="button"
                onClick={() => setMobileView("menu")}
                className="mb-3 flex items-center gap-1 text-[13px] font-semibold text-[color:var(--hc-muted)] lg:hidden"
              >
                <ChevronLeft className="h-4 w-4" />
                메뉴
              </button>

              <SectionPanel
                section={section}
                user={user}
                username={username}
                setUsername={setUsername}
                oldPassword={oldPassword}
                setOldPassword={setOldPassword}
                newPassword={newPassword}
                setNewPassword={setNewPassword}
                confirmPassword={confirmPassword}
                setConfirmPassword={setConfirmPassword}
                errors={errors}
                isSubmitting={isSubmitting}
                profileFile={profileFile}
                isUploadingProfile={isUploadingProfile}
                statsLoading={statsLoading}
                frames={frames}
                framesError={framesError}
                onRetryStats={loadStats}
                onChangeUsername={handleChangeUsername}
                onChangePassword={handleChangePassword}
                onProfileFileChange={handleProfileFileChange}
                onUploadProfileImage={handleUploadProfileImage}
              />
            </div>
          </div>
        ) : (
          <div className="hc-surface-card rounded-[20px] border p-5">
            <p className="text-[12px] text-[color:var(--hc-muted)]">
              내 정보를 불러오지 못했어요.
            </p>
          </div>
        )}
      </div>
      <MobileTabBar />
    </main>
  );
}

type SectionPanelProps = {
  section: SectionId;
  user: UserInfo;
  username: string;
  setUsername: (v: string) => void;
  oldPassword: string;
  setOldPassword: (v: string) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  errors: Errors;
  isSubmitting: boolean;
  profileFile: File | null;
  isUploadingProfile: boolean;
  statsLoading: boolean;
  frames: RemoteFrame[];
  framesError: boolean;
  onRetryStats: () => void;
  onChangeUsername: (e: FormEvent) => void;
  onChangePassword: (e: FormEvent) => void;
  onProfileFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onUploadProfileImage: () => void;
};

function SectionPanel(props: SectionPanelProps) {
  const { section } = props;

  if (section === "account") {
    return <AccountSection {...props} />;
  }
  if (section === "frames") {
    return (
      <FramesSection
        statsLoading={props.statsLoading}
        frames={props.frames}
        error={props.framesError}
        onRetry={props.onRetryStats}
      />
    );
  }
  if (section === "theme") {
    return (
      <div className="hc-surface-card rounded-[20px] border p-5 sm:p-6">
        <h2 className="text-[17px] font-extrabold">테마</h2>
        <p className="mt-1 text-[12px] text-[color:var(--hc-muted)]">
          앱 전체의 밝기 테마를 선택해요.
        </p>
        <div className="mt-4">
          <ColorThemePreferencePanel />
        </div>
      </div>
    );
  }
  return <PreferencesSection />;
}

function AccountSection({
  user,
  username,
  setUsername,
  oldPassword,
  setOldPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  errors,
  isSubmitting,
  profileFile,
  isUploadingProfile,
  onChangeUsername,
  onChangePassword,
  onProfileFileChange,
  onUploadProfileImage,
}: SectionPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* 프로필 이미지 */}
      <section className="hc-surface-card rounded-[20px] border p-5 sm:p-6">
        <h2 className="text-[17px] font-extrabold">프로필 이미지</h2>
        <div className="mt-4 flex items-center gap-2">
          <input
            type="file"
            accept={SUPPORTED_IMAGE_ACCEPT}
            onChange={onProfileFileChange}
            disabled={isUploadingProfile}
            className="block w-full text-[11.5px] text-[color:var(--hc-muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[color:var(--hc-surface-muted)] file:px-3 file:py-2 file:text-[11.5px] file:font-semibold file:text-[color:var(--hc-text)] hover:file:bg-[color:var(--hc-surface-muted-hover)]"
          />
          <button
            type="button"
            onClick={onUploadProfileImage}
            disabled={isUploadingProfile || !profileFile}
            className="hc-button-primary h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[11.5px] font-semibold disabled:opacity-50"
          >
            {isUploadingProfile ? "업로드 중" : "업로드"}
          </button>
        </div>
      </section>

      {/* 닉네임 */}
      <section className="hc-surface-card rounded-[20px] border p-5 sm:p-6">
        <h2 className="text-[17px] font-extrabold">닉네임</h2>
        <p className="mt-1 text-[12px] text-[color:var(--hc-muted)]">
          서비스에서 표시될 이름을 수정할 수 있어요.
        </p>
        <form onSubmit={onChangeUsername} className="mt-3 flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="hc-input h-10 flex-1 rounded-xl border px-3 text-[13px] outline-none"
            placeholder="닉네임을 입력해 주세요"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="hc-button-primary h-10 rounded-full px-4 text-[12px] font-semibold disabled:opacity-50"
          >
            저장
          </button>
        </form>
        {errors.username ? (
          <p className="mt-2 text-[11.5px] text-[color:var(--hc-primary-strong)]">
            {errors.username}
          </p>
        ) : null}
      </section>

      {/* 이메일 (읽기 전용) */}
      <section className="hc-surface-card rounded-[20px] border p-5 sm:p-6">
        <h2 className="text-[17px] font-extrabold">이메일</h2>
        <input
          value={user.email}
          readOnly
          disabled
          className="hc-input mt-3 h-10 w-full rounded-xl border px-3 text-[13px] text-[color:var(--hc-muted)] outline-none"
        />
      </section>

      {/* 비밀번호 변경 */}
      <section className="hc-surface-card rounded-[20px] border p-5 sm:p-6">
        <h2 className="text-[17px] font-extrabold">비밀번호 변경</h2>
        <form onSubmit={onChangePassword} className="mt-3 flex flex-col gap-3">
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
            className="hc-button-primary mt-1 h-10 rounded-full text-[12px] font-semibold disabled:opacity-50"
          >
            {isSubmitting ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      </section>
    </div>
  );
}

function FramesSection({
  statsLoading,
  frames,
  error,
  onRetry,
}: {
  statsLoading: boolean;
  frames: RemoteFrame[];
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="hc-surface-card rounded-[20px] border p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-extrabold">내 프레임</h2>
        <Link
          href="/theme"
          className="hc-accent-chip inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />새 프레임
        </Link>
      </div>

      {statsLoading ? (
        <p className="mt-4 text-[12px] text-[color:var(--hc-muted)]">
          불러오는 중...
        </p>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--hc-border)] px-4 py-8 text-center">
          <p className="text-[13px] font-semibold">
            프레임을 불러오지 못했어요.
          </p>
          <p className="mt-1 text-[11.5px] text-[color:var(--hc-muted)]">
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="hc-button-secondary mt-4 inline-flex h-9 items-center rounded-full border px-4 text-[12px] font-semibold"
          >
            다시 시도
          </button>
        </div>
      ) : frames.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--hc-border)] px-4 py-8 text-center">
          <p className="text-[13px] font-semibold">아직 보관한 프레임이 없어요.</p>
          <p className="mt-1 text-[11.5px] text-[color:var(--hc-muted)]">
            꾸미기에서 나만의 프레임을 만들어 보관해 보세요.
          </p>
          <Link
            href="/theme"
            className="hc-button-primary mt-4 inline-flex h-9 items-center rounded-full px-4 text-[12px] font-semibold"
          >
            프레임 만들러 가기
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {frames.map((frame) => (
            <article key={frame.frameId} className="flex flex-col gap-2">
              <div className="aspect-[3/4] overflow-hidden rounded-xl border border-[color:var(--hc-border-subtle)] bg-[color:var(--hc-surface-muted)]">
                {frame.source ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={frame.source}
                    alt={frame.title || `프레임 #${frame.frameId}`}
                    className="h-full w-full object-contain p-1.5"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center p-2">
                    <FramePreview
                      frameId={frameIdFromFrameType(frame.frameType)}
                    />
                  </div>
                )}
              </div>
              <p className="truncate text-[12px] font-semibold">
                {frame.title || `프레임 #${frame.frameId}`}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PreferencesSection() {
  // 백엔드 미연동 — UI 선구현(추후 BE 합의 후 연동). 로컬 상태로만 동작.
  const [highQuality, setHighQuality] = useState(true);
  const [watermark, setWatermark] = useState(true);
  const [language, setLanguage] = useState("ko");

  return (
    <section className="hc-surface-card rounded-[20px] border p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-extrabold">환경 설정</h2>
        <span className="rounded-full bg-[color:var(--hc-surface-muted)] px-2.5 py-1 text-[10.5px] font-semibold text-[color:var(--hc-muted)]">
          연동 예정
        </span>
      </div>
      <p className="mt-1 text-[12px] text-[color:var(--hc-muted)]">
        저장 화질·워터마크·언어 설정이에요. 서버 연동 전까지는 임시로 동작해요.
      </p>

      <div className="mt-4 flex flex-col">
        <ToggleRow
          title="고화질 저장"
          desc="원본 해상도로 저장해요."
          on={highQuality}
          onToggle={() => setHighQuality((v) => !v)}
        />
        <ToggleRow
          title="워터마크 표시"
          desc="하루컷 로고를 함께 남겨요."
          on={watermark}
          onToggle={() => setWatermark((v) => !v)}
        />
        <div className="flex items-center justify-between gap-3 py-3.5">
          <div>
            <div className="text-[14px] font-bold">언어</div>
            <div className="mt-0.5 text-[12px] text-[color:var(--hc-muted)]">
              표시 언어를 선택해요.
            </div>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="hc-input h-9 rounded-xl border px-3 text-[13px] outline-none"
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </section>
  );
}

function ToggleRow({
  title,
  desc,
  on,
  onToggle,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--hc-border-subtle)] py-3.5 last:border-b-0">
      <div>
        <div className="text-[14px] font-bold">{title}</div>
        <div className="mt-0.5 text-[12px] text-[color:var(--hc-muted)]">
          {desc}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          on
            ? "bg-[color:var(--hc-primary)]"
            : "bg-[color:var(--hc-surface-muted-hover)]"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
            on ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
