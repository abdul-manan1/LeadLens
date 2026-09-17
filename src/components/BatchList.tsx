import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getLeads, listBatches } from "@/lib/db";
import { computeStats } from "@/lib/service";

export async function BatchList() {
  const batches = await listBatches();
  if (!batches.length) {
    return (
      <div className="card px-5 py-8 text-center text-sm text-muted">
        No imports yet. Upload a CSV or load a sample above.
      </div>
    );
  }
  const rows = await Promise.all(batches.map(async (b) => ({ b, s: computeStats(await getLeads(b.id)) })));
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Batch</th>
            <th className="px-4 py-2.5 font-medium">Leads</th>
            <th className="px-4 py-2.5 font-medium">Enriched</th>
            <th className="px-4 py-2.5 font-medium">A / B tier</th>
            <th className="px-4 py-2.5 font-medium">Avg score</th>
            <th className="px-4 py-2.5 font-medium">Created</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ b, s }) => (
            <tr key={b.id} className="table-row border-t border-border">
              <td className="px-4 py-3 font-medium">
                <Link href={`/batches/${b.id}`} className="hover:text-brand">
                  {b.name}
                </Link>
              </td>
              <td className="px-4 py-3">
                {s.unique}
                {s.duplicates > 0 && <span className="ml-1 text-xs text-muted">(+{s.duplicates} dupes)</span>}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`chip ${b.status === "done" ? "bg-emerald-50 text-emerald-700" : b.status === "processing" ? "bg-amber-50 text-amber-700" : ""}`}
                >
                  {s.processed}/{s.unique}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-semibold text-tier-a">{s.tierCounts.A}</span>
                <span className="text-muted"> / </span>
                <span className="font-semibold text-tier-b">{s.tierCounts.B}</span>
              </td>
              <td className="px-4 py-3">{s.avgScore ?? "—"}</td>
              <td className="px-4 py-3 text-muted">{new Date(b.createdAt).toLocaleString()}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/batches/${b.id}`} className="btn btn-ghost">
                  Open <ArrowRight size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
