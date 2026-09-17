import type { BatchStats } from "@/lib/types";

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

export function StatsTiles({ stats }: { stats: BatchStats }) {
  const tiles: { label: string; value: string; sub?: string; tone?: string }[] = [
    { label: "Unique leads", value: String(stats.unique), sub: stats.duplicates ? `${stats.duplicates} duplicates removed` : "no duplicates" },
    { label: "Enriched", value: `${stats.processed}/${stats.unique}`, sub: pct(stats.processed, stats.unique) },
    { label: "Tier A", value: String(stats.tierCounts.A), sub: `${stats.tierCounts.B} in tier B`, tone: "text-tier-a" },
    { label: "Contactable", value: pct(stats.contactable, stats.processed || stats.unique), sub: `${stats.contactable} with verified email or phone` },
    { label: "Owner identified", value: pct(stats.ownerIdentified, stats.unique), sub: `${stats.ownerIdentified} leads` },
    { label: "Avg score", value: stats.avgScore == null ? "—" : String(stats.avgScore), sub: "acquisition fit / 100" },
    {
      label: "Needs attention",
      value: String(stats.blocked + stats.unreachable + stats.peOwned),
      sub: `${stats.peOwned} PE/corporate · ${stats.blocked} blocked · ${stats.unreachable} unreachable`,
      tone: stats.blocked + stats.unreachable + stats.peOwned ? "text-amber-600" : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {tiles.map((t) => (
        <div key={t.label} className="card px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t.label}</p>
          <p className={`mt-1 text-2xl font-semibold tracking-tight ${t.tone ?? ""}`}>{t.value}</p>
          {t.sub && <p className="mt-0.5 truncate text-[11px] text-muted">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}
