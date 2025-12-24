import { PageHeader } from "@/components/layout/PageHeader";

export default function HistoryPage() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-md flex flex-col gap-4">
        <PageHeader
          title="사진 기록"
          backHref="/home"
          backLabel="홈으로"
          description={<>인생네컷 사진 기록 페이지(추후 개발 예정)</>}
        />
        <p className="text-xs text-zinc-500"></p>
      </div>
    </main>
  );
}
