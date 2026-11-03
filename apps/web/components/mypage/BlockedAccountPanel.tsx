import { COMPANY } from "@harucut/shared";
import type { UserInfo } from "@/lib/api-types";

/**
 * 정지 계정의 마이페이지. 쓰지는 못하고 계정을 확인한 뒤 로그아웃하거나 탈퇴만 한다.
 * 정지 이유는 감사 로그에만 있다 — 운영자가 적은 내부 메모라 그대로 보여 주지 않고, 물어볼 곳을 알려 준다.
 */
export function BlockedAccountPanel({ user }: { user: UserInfo }) {
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="min-w-0 px-0.5">
        <p className="break-words text-[18px] font-extrabold">{user.username}</p>
        <p className="break-all text-[13px] text-(--hc-muted)">{user.email}</p>
      </div>
      <section
        aria-labelledby="blocked-account-title"
        className="flex flex-col gap-2 rounded-[20px] border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) p-5"
      >
        <h2 id="blocked-account-title" className="text-[16px] font-bold">
          이용이 제한된 계정이에요
        </h2>
        <p className="max-w-[60ch] text-[14px] leading-relaxed">
          촬영, 프레임, 기록, 행사 운영을 쓸 수 없어요. 여기서는 로그아웃과 회원 탈퇴만 할 수 있어요.
        </p>
        <p className="text-[14px] leading-relaxed">
          궁금한 점은{" "}
          <a href={`mailto:${COMPANY.email}`} className="break-all font-semibold underline underline-offset-4">
            {COMPANY.email}
          </a>{" "}
          로 문의해 주세요.
        </p>
      </section>
    </div>
  );
}
