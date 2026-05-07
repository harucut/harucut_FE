"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { AuthField } from "@/components/auth/AuthField";
import { PageHeader } from "@/components/layout/PageHeader";
import { ColorThemePreferencePanel } from "@/components/theme/ColorThemePreferencePanel";
import { clientApi } from "@/lib/clientApi";
import { uploadProfileImage } from "@/lib/profileImageApi";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";

type Errors = {
  common?: string | null;
  username?: string | null;
  oldPassword?: string | null;
  newPassword?: string | null;
  confirmPassword?: string | null;
};

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

  useEffect(() => {
    void fetchUser();
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
      "정말 탈퇴하시겠어요?\n1주일 내로 다시 로그인하면 계정을 복구할 수 있어요.",
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

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)]">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader
          title="내 계정"
          rightSlot={
            <button
              type="button"
              onClick={fetchUser}
              disabled={isSubmitting || loading}
              className="hc-button-icon grid h-9 w-9 place-items-center rounded-full border text-zinc-300 disabled:opacity-50"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          }
          description={
            errors.common ? (
              <span className="text-[11px] text-red-400">{errors.common}</span>
            ) : undefined
          }
        />

        {loading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] text-zinc-400">정보를 불러오는 중...</p>
          </div>
        ) : user ? (
          <>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800">
                  {user.profileUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.profileUrl}
                      alt="프로필 이미지"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[11px] text-zinc-400">USER</span>
                  )}
                </div>

                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{user.username}</span>
                  <span className="text-[11px] text-zinc-400">
                    {user.email}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <ShieldCheck className="h-4 w-4 text-[color:var(--hc-primary-strong)]" />
                    <span className="text-[11px]">로그인 플랫폼</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-zinc-100">
                    {user.loginPlatform ?? "HARUCUT"}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <CreditCard className="h-4 w-4 text-[color:var(--hc-primary-strong)]" />
                    <span className="text-[11px]">플랜</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-zinc-100">
                    {user.planTier ?? "BASIC"}
                    {user.monthlyPrice ? ` · 월 ${user.monthlyPrice.toLocaleString("ko-KR")}원` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="file"
                  accept={SUPPORTED_IMAGE_ACCEPT}
                  onChange={handleProfileFileChange}
                  disabled={isUploadingProfile}
                  className="block w-full text-[11px] text-zinc-300 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-[11px] file:font-semibold file:text-zinc-100 hover:file:bg-zinc-700"
                />
                <button
                  type="button"
                  onClick={handleUploadProfileImage}
                  disabled={isUploadingProfile || !profileFile}
                  className="hc-button-primary h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[11px] font-semibold disabled:opacity-50"
                >
                  {isUploadingProfile ? "업로드 중" : "업로드"}
                </button>
              </div>
            </section>

            <ColorThemePreferencePanel />

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold">닉네임 변경</h2>
              <p className="mt-1 text-[11px] text-zinc-400">
                서비스에서 표시될 이름을 수정할 수 있어요.
              </p>

              <form onSubmit={handleChangeUsername} className="mt-3 flex gap-2">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="hc-input h-9 flex-1 rounded-xl border px-3 text-[12px] outline-none"
                  placeholder="닉네임을 입력해 주세요"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="hc-button-primary h-9 rounded-full px-4 text-[11px] font-semibold disabled:opacity-50"
                >
                  저장
                </button>
              </form>

              {errors.username ? (
                <p className="mt-2 text-[11px] text-red-400">
                  {errors.username}
                </p>
              ) : null}
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold">비밀번호 변경</h2>

              <form
                onSubmit={handleChangePassword}
                className="mt-3 flex flex-col gap-3"
              >
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
                  className="hc-button-primary mt-1 h-9 rounded-full text-[11px] font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? "변경 중..." : "비밀번호 변경"}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold">로그아웃</h2>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isSubmitting}
                className="mt-3 h-9 w-full rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
              >
                로그아웃
              </button>
            </section>

            <section className="rounded-2xl border border-red-900/40 bg-red-950/10 p-4">
              <h2 className="text-sm font-semibold text-red-700 dark:text-red-200">
                회원 탈퇴 요청
              </h2>
              <p className="mt-1 text-[11px] text-red-900/80 dark:text-red-200/80">
                탈퇴를 요청하면 계정이 비활성화돼요. 다시 로그인하면 탈퇴를
                취소하고 계정을 다시 사용할 수 있어요.
              </p>
              <button
                type="button"
                onClick={handleExit}
                disabled={isSubmitting}
                className="mt-3 h-9 w-full rounded-full bg-red-500 text-[11px] font-semibold text-zinc-950 hover:bg-red-400 disabled:opacity-50"
              >
                회원 탈퇴 요청
              </button>
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] text-zinc-400">
              내 정보를 불러오지 못했어요.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
