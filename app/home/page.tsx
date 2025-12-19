import Link from "next/link";
import { FeatureCard } from "./_components/FeatureCard";
import { features } from "./_config/features";

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-md flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              RECORDAY
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              오늘은 어떻게 기록할까?
            </h1>
          </div>
          <Link
            href="/mypage"
            className="h-9 w-9 rounded-full bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-400 inline-flex items-center justify-center"
          >
            사용자
          </Link>
        </header>

        <p className="text-xs text-zinc-500">
          아래에서 원하는 기능을 선택해서 인생네컷을 만들어 보세요.
          <br />
          추후 업데이트를 통해 기능들이 추가될 예정이에요.
          {/* 지금은 이 기기에서만 저장되지만, 추후 로그인으로 어디서든 이어볼 수
          있어요. */}
        </p>

        <section className="grid grid-cols-1 gap-3">
          {features.map((f) => (
            <FeatureCard key={f.id} feature={f} />
          ))}
        </section>
      </div>
    </main>
  );
}
