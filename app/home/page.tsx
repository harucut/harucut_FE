import { PageHeader } from "@/components/layout/PageHeader";
import { FeatureCard } from "./_components/FeatureCard";
import { features } from "./_config/features";

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-md flex flex-col gap-6">
        <PageHeader
          title="오늘은 어떻게 기록할까?"
          rightSlot="사용자"
          description={
            <>
              아래에서 원하는 기능을 선택해서 인생네컷을 만들어 보세요.
              <br />
              추후 업데이트를 통해 기능들이 추가될 예정이에요.
            </>
          }
        />
        <section className="grid grid-cols-1 gap-3">
          {features.map((f) => (
            <FeatureCard key={f.id} feature={f} />
          ))}
        </section>
      </div>
    </main>
  );
}
