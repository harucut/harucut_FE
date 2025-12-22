import Link from "next/link";

export default function HistoryPage() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-md flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">사진 기록</h1>
          <Link
            href="/home"
            className="text-xs text-zinc-400 underline underline-offset-4"
          >
            홈으로
          </Link>
        </header>

        <p className="text-xs text-zinc-500">
          인생네컷 사진 기록 페이지(추후 개발 예정)
        </p>
      </div>
    </main>
  );
}
