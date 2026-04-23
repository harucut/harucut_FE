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
        "hc-surface-card group flex items-start gap-3 rounded-[28px] border p-4 backdrop-blur transition duration-200",
        "hover:translate-y-[-1px] hover:border-[color:var(--hc-border-strong)] hover:bg-[color:var(--hc-surface-highlight)]",
        feature.comingSoon ? "opacity-70 pointer-events-none" : "",
      ].join(" ")}
    >
      <div className="mt-1">
        <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/25">
          <Icon className="h-5 w-5 text-[color:var(--hc-accent-soft-text)]" />
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
