import type { Tier } from "@/lib/types";

const TIER_CLASS: Record<Tier, string> = {
  A: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  B: "bg-sky-50 text-sky-700 ring-sky-200",
  C: "bg-amber-50 text-amber-700 ring-amber-200",
  D: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function ScorePill({ score, tier, size = "md" }: { score: number | null; tier: Tier | null; size?: "md" | "lg" }) {
  if (score == null || !tier) return <span className="chip">—</span>;
  const dim = size === "lg" ? "h-12 w-12 text-lg" : "h-8 w-8 text-xs";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`grid ${dim} place-items-center rounded-lg font-bold ring-1 ${TIER_CLASS[tier]}`}>{score}</span>
      <span className={`text-xs font-bold ${tier === "A" ? "text-tier-a" : tier === "B" ? "text-tier-b" : tier === "C" ? "text-tier-c" : "text-tier-d"}`}>
        {tier}
      </span>
    </span>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className={`chip ring-1 ${TIER_CLASS[tier]}`}>Tier {tier}</span>;
}
