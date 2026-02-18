"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clientApi } from "@/lib/clientApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { RefreshCw } from "lucide-react";
import { uploadProfileImage } from "@/lib/profileImageApi";

type UserInfoResponse = {
  code: string;
  status: number;
  message: string | null;
  data: {
    id: number;
    email: string;
    username: string;
    profileUrl: string | null;
  };
};

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
  const [user, setUser] = useState<UserInfoResponse["data"] | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  // username 변경
  const [username, setUsername] = useState("");

  // 비밀번호 변경
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);

  const fetchUser = async () => {
    setLoading(true);
    setErrors({});
    try {
      const res = await clientApi.get<UserInfoResponse>(
        "/api/client/user-info",
      );
      setUser(res.data.data);
      setUsername(res.data.data.username || "");
    } catch (e) {
      console.error(e);
      setErrors({
        common: "유저 정보를 불러오지 못했어요. 다시 시도해 주세요.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      setUser({
        id: 1,
        email: "test@harucut.com",
        username: "테스트유저",
        profileUrl: null,
      });
      setLoading(false);
      return;
    }

    fetchUser();
  }, []);

  const handleChangeUsername = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const next = username.trim();
    if (!next) {
      setErrors({ username: "사용자 이름을 입력해 주세요." });
      setIsSubmitting(false);
      return;
    }

    try {
      await clientApi.patch("/api/client/user/username", { username: next });
      setUser((prev) => (prev ? { ...prev, username: next } : prev));
      alert("사용자 이름이 변경됐어요.");
    } catch (e) {
      console.error(e);
      setErrors({ common: "사용자 이름 변경에 실패했어요." });
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
      alert("비밀번호가 변경됐어요.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      console.error(e);
      setErrors({ common: "비밀번호 변경에 실패했어요." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProfileFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextFile = e.target.files?.[0] ?? null;
    setProfileFile(nextFile);
  };

  const handleUploadProfileImage = async () => {
    if (!profileFile) {
      setErrors({ common: "업로드할 파일을 선택해주세요." });
      return;
    }

    setErrors({});
    setIsUploadingProfile(true);
    try {
      await uploadProfileImage(profileFile);
      await fetchUser();
      setProfileFile(null);
      alert("프로필 이미지가 변경되었습니다.");
    } catch (e) {
      console.error(e);
      setErrors({ common: "프로필 이미지 업로드에 실패했습니다." });
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
    } catch (e) {
      console.error(e);
      setErrors({ common: "로그아웃에 실패했어요." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExit = async () => {
    const ok = confirm(
      "정말 회원 탈퇴할까요?\n탈퇴하면 계정은 복구할 수 없어요.",
    );
    if (!ok) return;

    setErrors({});
    setIsSubmitting(true);
    try {
      await clientApi.delete("/api/client/exit");

      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error(e);
      setErrors({ common: "회원 탈퇴에 실패했어요." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-md flex flex-col gap-6">
        <PageHeader
          title="오늘은 어떻게 기록할까?"
          backHref="/mypage"
          rightSlot={
            <button
              onClick={fetchUser}
              disabled={isSubmitting || loading}
              className="h-9 w-9 grid place-items-center rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          }
          description={
            <span
              className={`text-[11px] ${
                errors.common ? "text-red-400" : "text-zinc-400"
              }`}
            >
              {errors.common ?? "계정 정보를 관리할 수 있어요."}
            </span>
          }
        />

        {loading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] text-zinc-400">불러오는 중...</p>
          </div>
        ) : user ? (
          <>
            {/* 프로필 */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex gap-3 items-center">
                <div className="h-12 w-12 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center">
                  {user.profileUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.profileUrl}
                      alt="profile"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[11px] text-zinc-400">USER</span>
                  )}
                </div>

                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{user.username}</span>
                  <span className="text-[11px] text-zinc-400">{user.email}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,video/webm"
                  onChange={handleProfileFileChange}
                  disabled={isUploadingProfile}
                  className="block w-full text-[11px] text-zinc-300 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-[11px] file:font-semibold file:text-zinc-100 hover:file:bg-zinc-700"
                />
                <button
                  type="button"
                  onClick={handleUploadProfileImage}
                  disabled={isUploadingProfile || !profileFile}
                  className="h-9 whitespace-nowrap rounded-full bg-emerald-500 px-4 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isUploadingProfile ? "업로드 중..." : "프로필 업로드"}
                </button>
              </div>
            </section>

            {/* 사용자 이름 변경 */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold">사용자 이름 변경</h2>
              <p className="mt-1 text-[11px] text-zinc-400">
                앱에서 표시되는 이름이에요.
              </p>

              <form onSubmit={handleChangeUsername} className="mt-3 flex gap-2">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 h-9 rounded-xl bg-zinc-950 border border-zinc-800 px-3 text-[12px] outline-none focus:border-zinc-600"
                  placeholder="레코데이"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-9 rounded-full bg-emerald-500 px-4 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  저장
                </button>
              </form>
              {errors.username && (
                <p className="mt-2 text-[11px] text-red-400">
                  {errors.username}
                </p>
              )}
            </section>

            {/* 비밀번호 변경 */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold">비밀번호 변경</h2>

              <form
                onSubmit={handleChangePassword}
                className="mt-3 flex flex-col gap-2"
              >
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="h-9 rounded-xl bg-zinc-950 border border-zinc-800 px-3 text-[12px] outline-none focus:border-zinc-600"
                  placeholder="현재 비밀번호"
                />
                {errors.oldPassword && (
                  <p className="text-[11px] text-red-400">
                    {errors.oldPassword}
                  </p>
                )}

                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-9 rounded-xl bg-zinc-950 border border-zinc-800 px-3 text-[12px] outline-none focus:border-zinc-600"
                  placeholder="새 비밀번호"
                />
                {errors.newPassword && (
                  <p className="text-[11px] text-red-400">
                    {errors.newPassword}
                  </p>
                )}

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-9 rounded-xl bg-zinc-950 border border-zinc-800 px-3 text-[12px] outline-none focus:border-zinc-600"
                  placeholder="새 비밀번호 확인"
                />
                {errors.confirmPassword && (
                  <p className="text-[11px] text-red-400">
                    {errors.confirmPassword}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-1 h-9 rounded-full bg-emerald-500 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isSubmitting ? "변경 중..." : "비밀번호 변경"}
                </button>
              </form>
            </section>

            {/* 로그아웃 */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold">로그아웃</h2>
              <button
                onClick={handleLogout}
                disabled={isSubmitting}
                className="mt-3 h-9 w-full rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
              >
                로그아웃
              </button>
            </section>

            {/* 회원 탈퇴 */}
            <section className="rounded-2xl border border-red-900/40 bg-red-950/10 p-4">
              <h2 className="text-sm font-semibold text-red-200">회원 탈퇴</h2>
              <p className="mt-1 text-[11px] text-red-200/80">
                회원 탈퇴 시 계정은 1주일 내로만 복구할 수 있어요
              </p>
              <button
                onClick={handleExit}
                disabled={isSubmitting}
                className="mt-3 h-9 w-full rounded-full bg-red-500 text-[11px] font-semibold text-zinc-950 hover:bg-red-400 disabled:opacity-50"
              >
                회원 탈퇴
              </button>
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] text-zinc-400">
              유저 정보를 불러오지 못했어요.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
