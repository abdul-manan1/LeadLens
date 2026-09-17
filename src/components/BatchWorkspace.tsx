"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  Loader2,
  Mail,
  Phone,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  Trash2,
  UserCheck,
} from "lucide-react";
import { LeadDrawer } from "./LeadDrawer";
import { ScorePill } from "./ScorePill";
import { StatsTiles } from "./StatsTiles";
import { Stepper } from "./Stepper";
import { WeightsPanel } from "./WeightsPanel";
import { formatMoney } from "@/lib/normalize";
import type { Batch, BatchStats, Lead, LeadStatus, ScoreWeights, Tier } from "@/lib/types";

interface Payload {
  batch: Batch;
  leads: Lead[];
  stats: BatchStats;
}

type SortKey = "score" | "company" | "revenue" | "employees";

export function BatchWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stopRef = useRef(false);
  const autostarted = useRef(false);

  // filters
  const [q, setQ] = useState("");
  const [tiers, setTiers] = useState<Set<Tier>>(new Set(["A", "B", "C", "D"]));
  const [minScore, setMinScore] = useState(0);
  const [onlyContactable, setOnlyContactable] = useState(false);
  const [onlyOwner, setOnlyOwner] = useState(false);
  const [hidePe, setHidePe] = useState(false);
  const [showDupes, setShowDupes] = useState(false);
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "score", dir: "desc" });

  const load = useCallback(async () => {
    const res = await fetch(`/api/batches/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 404 ? "This import no longer exists." : "Failed to load batch.");
      return null;
    }
    const json = (await res.json()) as Payload;
    setData(json);
    return json;
  }, [id]);

  const runEnrichment = useCallback(async () => {
    setEnriching(true);
    stopRef.current = false;
    try {
      // Chunked loop: each request is small enough for a serverless function.
      for (let i = 0; i < 500 && !stopRef.current; i++) {
        const res = await fetch(`/api/batches/${id}/enrich?size=4`, { method: "POST" });
        if (!res.ok) break;
        const json = (await res.json()) as { done: boolean };
        await load();
        if (json.done) break;
      }
    } finally {
      setEnriching(false);
      await load();
    }
  }, [id, load]);

  useEffect(() => {
    const autostart = search.get("autostart") === "1";
    const timer = setTimeout(async () => {
      const json = await load();
      if (json && autostart && json.batch.status !== "done" && !autostarted.current) {
        autostarted.current = true;
        router.replace(`/batches/${id}`);
        void runEnrichment();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [id, load, router, runEnrichment, search]);

  const applyWeights = useCallback(
    async (weights: ScoreWeights, targetIndustries: string[]) => {
      await fetch(`/api/batches/${id}/rescore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weights, targetIndustries }),
      });
      await load();
    },
    [id, load],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const rows = data.leads.filter((l) => {
      if (!showDupes && l.dedupeOf) return false;
      if (l.tier && !tiers.has(l.tier)) return false;
      if ((l.score ?? 0) < minScore) return false;
      if (onlyContactable && !l.validation?.contactable) return false;
      if (onlyOwner && !l.ownerName && !l.enrichment?.ownerHints.length) return false;
      if (hidePe && l.scoreBreakdown?.flags.includes("likely-pe-or-corporate-owned")) return false;
      if (status !== "all" && l.status !== status) return false;
      if (needle) {
        const hay = `${l.company} ${l.domain ?? ""} ${l.industry ?? ""} ${l.location ?? ""} ${l.ownerName ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = sort.key === "company" ? a.company.toLowerCase() : (a[sort.key] ?? -1);
      const bv = sort.key === "company" ? b.company.toLowerCase() : (b[sort.key] ?? -1);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [data, q, tiers, minScore, onlyContactable, onlyOwner, hidePe, showDupes, status, sort]);

  const selected = data?.leads.find((l) => l.id === selectedId) ?? null;

  function exportUrl(format: "generic" | "hubspot") {
    const params = new URLSearchParams({ format });
    const allUnique = data ? data.leads.filter((l) => !l.dedupeOf).length : 0;
    if (filtered.length !== allUnique && filtered.length <= 400) params.set("ids", filtered.map((l) => l.id).join(","));
    return `/api/batches/${id}/export?${params.toString()}`;
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "company" ? "asc" : "desc" }));
  }

  if (error) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-danger">{error}</p>
        <Link href="/" className="btn btn-secondary mt-4">
          <ArrowLeft size={14} /> Back to imports
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
        <Loader2 className="animate-spin" size={16} /> Loading batch…
      </div>
    );
  }

  const { batch, stats } = data;
  const progress = stats.unique ? Math.round((stats.processed / stats.unique) * 100) : 0;
  const step: 1 | 2 | 3 = batch.status === "done" ? 3 : 2;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <ArrowLeft size={12} /> All imports
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{batch.name}</h1>
          <Stepper current={step} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {enriching ? (
            <button type="button" className="btn btn-secondary" onClick={() => (stopRef.current = true)}>
              <Square size={14} /> Pause
            </button>
          ) : batch.status !== "done" ? (
            <button type="button" className="btn btn-primary" onClick={() => void runEnrichment()}>
              <Play size={14} /> {stats.processed ? "Resume enrichment" : "Start enrichment"}
            </button>
          ) : null}
          {!enriching && stats.unreachable > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              title="Re-queue leads whose site timed out or was unreachable (blocked and robots-disallowed sites are left alone)"
              onClick={async () => {
                await fetch(`/api/batches/${id}/enrich?retry=failed`, { method: "POST" });
                await load();
                void runEnrichment();
              }}
            >
              <RotateCcw size={14} /> Retry {stats.unreachable} failed
            </button>
          )}
          <button type="button" className={`btn ${showWeights ? "btn-primary" : "btn-secondary"}`} onClick={() => setShowWeights((v) => !v)}>
            <SlidersHorizontal size={14} /> Weights
          </button>
          <a className="btn btn-secondary" href={exportUrl("generic")}>
            <Download size={14} /> CSV ({filtered.length})
          </a>
          <a className="btn btn-secondary" href={exportUrl("hubspot")} title="Column headers match HubSpot's company import">
            <Download size={14} /> HubSpot CSV
          </a>
          <button
            type="button"
            className="btn btn-ghost text-danger"
            onClick={async () => {
              if (!confirm("Delete this import and all its leads?")) return;
              await fetch(`/api/batches/${id}`, { method: "DELETE" });
              router.push("/");
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {(enriching || batch.status !== "done") && (
        <div className="card flex items-center gap-4 px-4 py-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-medium ${enriching ? "pulse" : ""}`}>
                {enriching ? "Scanning websites, checking MX records, computing scores…" : "Enrichment paused"}
              </span>
              <span className="font-mono text-muted">
                {stats.processed}/{stats.unique} · {progress}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      <StatsTiles stats={stats} />

      <div className={`grid gap-4 ${showWeights ? "xl:grid-cols-[1fr_320px]" : ""}`}>
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
            <label className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input w-56 !pl-8" placeholder="Search company, domain, city…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              {(["A", "B", "C", "D"] as Tier[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setTiers((s) => {
                      const n = new Set(s);
                      if (n.has(t)) n.delete(t);
                      else n.add(t);
                      return n;
                    })
                  }
                  className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${tiers.has(t) ? "bg-slate-900 text-white" : "text-muted hover:bg-slate-100"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              Min score
              <input type="number" min={0} max={100} className="input w-16 !py-1" value={minScore} onChange={(e) => setMinScore(Number(e.target.value) || 0)} />
            </label>
            <select className="select !py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus | "all")}>
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="qualified">Qualified</option>
              <option value="contacted">Contacted</option>
              <option value="rejected">Rejected</option>
            </select>
            <Toggle checked={onlyContactable} onChange={setOnlyContactable} label="Contactable" />
            <Toggle checked={onlyOwner} onChange={setOnlyOwner} label="Owner known" />
            <Toggle checked={hidePe} onChange={setHidePe} label="Hide PE/corporate" />
            <Toggle checked={showDupes} onChange={setShowDupes} label={`Show dupes (${stats.duplicates})`} />
            <span className="ml-auto text-xs text-muted">
              {filtered.length} of {stats.unique}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <Th onClick={() => toggleSort("score")} active={sort.key === "score"} dir={sort.dir}>
                    Score
                  </Th>
                  <Th onClick={() => toggleSort("company")} active={sort.key === "company"} dir={sort.dir}>
                    Company
                  </Th>
                  <th className="px-3 py-2 font-medium">Industry · Location</th>
                  <Th onClick={() => toggleSort("revenue")} active={sort.key === "revenue"} dir={sort.dir}>
                    Revenue
                  </Th>
                  <Th onClick={() => toggleSort("employees")} active={sort.key === "employees"} dir={sort.dir}>
                    Staff
                  </Th>
                  <th className="px-3 py-2 font-medium">Founded</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Signals</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted">
                      No leads match these filters.
                    </td>
                  </tr>
                )}
                {filtered.map((l) => {
                  const e = l.enrichment;
                  const v = l.validation;
                  const pe = l.scoreBreakdown?.flags.includes("likely-pe-or-corporate-owned");
                  const pending = !l.enrichedAt && !l.dedupeOf;
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setSelectedId(l.id)}
                      className={`table-row cursor-pointer border-t border-border ${selectedId === l.id ? "selected" : ""} ${l.dedupeOf ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <ScorePill score={l.score} tier={l.tier} />
                      </td>
                      <td className="max-w-[240px] px-3 py-2">
                        <p className="truncate font-medium">{l.company}</p>
                        <p className="truncate text-xs text-muted">
                          {l.domain ?? "no website"}
                          {l.dedupeOf && <span className="ml-1 chip">duplicate</span>}
                          {pending && <span className="ml-1 chip pulse">pending</span>}
                        </p>
                      </td>
                      <td className="max-w-[220px] px-3 py-2">
                        <p className="truncate">{l.industry ?? "—"}</p>
                        <p className="truncate text-xs text-muted">{l.location ?? "—"}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{formatMoney(l.revenue)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.employees ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {e?.foundedYear ?? (e?.domainAgeYears != null ? <span className="text-muted">~{new Date().getFullYear() - Math.round(e.domainAgeYears)}</span> : "—")}
                      </td>
                      <td className="max-w-[160px] px-3 py-2">
                        {l.ownerName ? (
                          <span className="flex items-center gap-1 truncate text-xs">
                            <UserCheck size={12} className="shrink-0 text-emerald-600" /> {l.ownerName}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <Mail
                            size={14}
                            className={v?.emails.some((x) => x.verdict === "valid") ? "text-emerald-600" : v?.emails.some((x) => x.verdict === "risky") ? "text-amber-500" : "text-slate-300"}
                          />
                          <Phone size={14} className={v?.phones.some((x) => x.valid) ? "text-emerald-600" : "text-slate-300"} />
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {pe && (
                            <span className="chip bg-red-50 text-red-700">
                              <ShieldAlert size={10} /> PE/corp
                            </span>
                          )}
                          {e?.blocked && <span className="chip bg-amber-50 text-amber-700">blocked</span>}
                          {e && !e.reachable && !e.blocked && l.domain && <span className="chip bg-amber-50 text-amber-700">unreachable</span>}
                          {e?.hasCareersPage && <span className="chip bg-emerald-50 text-emerald-700">hiring</span>}
                          {e?.techSignals.slice(0, 2).map((t) => (
                            <span key={t} className="chip">
                              {t}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`chip ${l.status === "qualified" ? "bg-emerald-50 text-emerald-700" : l.status === "contacted" ? "bg-sky-50 text-sky-700" : l.status === "rejected" ? "bg-slate-200 text-slate-500" : ""}`}
                        >
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {showWeights && <WeightsPanel key={batch.id} weights={batch.weights} targetIndustries={batch.targetIndustries} onApply={applyWeights} />}
      </div>

      {selected && (
        <LeadDrawer
          key={selected.id}
          lead={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={(patch) =>
            setData((d) => (d ? { ...d, leads: d.leads.map((l) => (l.id === selected.id ? { ...l, ...patch } : l)) } : d))
          }
        />
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition ${checked ? "border-brand bg-brand-soft/60" : "border-border hover:bg-slate-50"}`}>
      <input type="checkbox" className="accent-[var(--brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Th({ children, onClick, active, dir }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: "asc" | "desc" }) {
  return (
    <th className="px-3 py-2 font-medium">
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 uppercase hover:text-foreground ${active ? "text-foreground" : ""}`}>
        {children}
        {active && (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
}
