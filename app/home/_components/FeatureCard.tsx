import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type Feature = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

export function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;

  return (
    <Link
      href={feature.href}
      className={[
        "group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4",
        "flex items-start gap-3",
        "hover:border-emerald-500/70 hover:bg-zinc-900 transition-colors",
        feature.comingSoon ? "opacity-70 pointer-events-none" : "",
      ].join(" ")}
    >
      <div className="mt-1">
        <div className="relative h-10 w-10 rounded-2xl bg-white flex items-center justify-center overflow-hidden">
          <Icon className="h-5 w-5 text-emerald-400" />
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{feature.title}</h2>
          {feature.comingSoon && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300 border border-amber-500/30">
              준비 중
            </span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-400">
          {feature.description}
        </p>
      </div>
    </Link>
  );
}
