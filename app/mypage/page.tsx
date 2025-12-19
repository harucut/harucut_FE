"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

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

  const fetchUser = async () => {
    setLoading(true);
    setErrors({});
    try {
      const res = await api.get<UserInfoResponse>("/api/client/user-info");

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
      await api.patch("/api/auth/user/change/username", { username: next });
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
      await api.patch("/api/recorday/change/password", {
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

  const handleLogout = async () => {
    setErrors({});
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/client/logout", { method: "DELETE" });
      if (!res.ok) throw new Error("logout failed");

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
      "정말 회원 탈퇴할까요?\n탈퇴하면 계정은 복구할 수 없어요."
    );
    if (!ok) return;

    setErrors({});
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/client/exit", { method: "DELETE" });
      if (!res.ok) throw new Error("exit failed");

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
        <header className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <Link
              href="/home"
              className="text-[11px] tracking-[0.16em] text-zinc-500"
            >
              RECORDAY
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">마이페이지</h1>
          </div>

          <button
            onClick={fetchUser}
            className="h-9 rounded-full bg-zinc-900 border border-zinc-700 px-4 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            새로고침
          </button>
        </header>

        {errors.common && (
          <p className="text-[11px] text-red-400">{errors.common}</p>
        )}

        {loading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] text-zinc-400">불러오는 중...</p>
          </div>
        ) : user ? (
          <>
            {/* 프로필 */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex gap-3 items-center">
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
              <h2 className="text-sm font-semibold">세션</h2>
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
              <h2 className="text-sm font-semibold text-red-200">위험 구역</h2>
              <p className="mt-1 text-[11px] text-red-200/80">
                회원 탈퇴 시 계정은 복구할 수 없어요.
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
