"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  Phone,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { ScorePill } from "./ScorePill";
import { formatMoney } from "@/lib/normalize";
import type { Lead, LeadStatus } from "@/lib/types";

const STATUSES: LeadStatus[] = ["new", "qualified", "contacted", "rejected"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-sm">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function LeadDrawer({
  lead,
  onClose,
  onUpdate,
}: {
  lead: Lead;
  onClose: () => void;
  onUpdate: (patch: Partial<Lead>) => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [opener, setOpener] = useState(lead.opener ?? "");
  const [openerSource, setOpenerSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parent renders this component with key={lead.id}, so state resets per lead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Lock the page scroll while the drawer is open so wheel events stay inside it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const e = lead.enrichment;
  const v = lead.validation;
  const sb = lead.scoreBreakdown;

  async function patch(body: { status?: LeadStatus; notes?: string }) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      onUpdate({ status: json.lead.status, notes: json.lead.notes });
    }
  }

  async function makeOpener() {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/opener`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setOpener(json.opener);
        setOpenerSource(json.source);
        onUpdate({ opener: json.opener });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-hidden bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Building2 size={13} /> {lead.industry ?? "Industry unknown"}
              {lead.location && <span>· {lead.location}</span>}
            </div>
            <h2 className="mt-0.5 truncate text-lg font-semibold">{lead.company}</h2>
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
                <Globe size={12} /> {lead.domain} <ExternalLink size={11} />
              </a>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ScorePill score={lead.score} tier={lead.tier} size="lg" />
            <button type="button" className="btn btn-ghost !p-2" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {sb?.flags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {sb.flags.map((f) => (
                <span
                  key={f}
                  className={`chip ${
                    f.includes("pe-or-corporate")
                      ? "bg-red-50 text-red-700"
                      : f.includes("blocked") || f.includes("unreachable")
                        ? "bg-amber-50 text-amber-700"
                        : f === "direct-email" || f === "hiring"
                          ? "bg-emerald-50 text-emerald-700"
                          : ""
                  }`}
                >
                  {f.includes("pe-or-corporate") && <ShieldAlert size={11} />}
                  {(f.includes("blocked") || f.includes("unreachable")) && <AlertTriangle size={11} />}
                  {f.replace(/-/g, " ")}
                </span>
              ))}
            </div>
          ) : null}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Why this score</h3>
            {sb ? (
              <ul className="space-y-2">
                {sb.components.map((c) => (
                  <li key={c.key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{c.label}</span>
                      <span className="font-mono text-xs text-muted">
                        {c.points} / {c.weight}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${c.ratio >= 0.75 ? "bg-emerald-500" : c.ratio >= 0.45 ? "bg-sky-500" : c.ratio > 0 ? "bg-amber-400" : "bg-slate-300"}`}
                        style={{ width: `${Math.max(2, c.ratio * 100)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{c.reason}</p>
                  </li>
                ))}
                {sb.penalties.map((p) => (
                  <li key={p.label} className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
                    <span>{p.label}</span>
                    <span className="font-mono font-semibold">{p.points}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Not scored yet.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Firmographics</h3>
            <dl className="space-y-1.5">
              <Row label="Est. revenue">{formatMoney(lead.revenue)}</Row>
              <Row label="Employees">{lead.employees ?? "—"}</Row>
              <Row label="Owner">{lead.ownerName ?? (e?.ownerHints.length ? `${e.ownerHints[0]} (from website)` : "—")}</Row>
              <Row label="Founded">
                {e?.foundedYear ?? (e?.copyrightStartYear ? `~${e.copyrightStartYear} (copyright)` : "—")}
                {e?.domainAgeYears != null && <span className="ml-2 text-xs text-muted">domain {e.domainAgeYears} yrs</span>}
              </Row>
              {e?.jsonLd?.address && <Row label="Address">{e.jsonLd.address}</Row>}
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Verified contacts</h3>
            {v ? (
              <div className="space-y-2">
                {v.emails.length === 0 && v.phones.length === 0 && <p className="text-sm text-muted">No emails or phones found.</p>}
                {v.emails.map((em) => (
                  <div key={em.email} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Mail size={13} className="shrink-0 text-muted" />
                      <span className="truncate font-mono text-xs">{em.email}</span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <span className={`chip ${em.verdict === "valid" ? "bg-emerald-50 text-emerald-700" : em.verdict === "risky" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                        {em.verdict}
                      </span>
                      {em.roleBased && <span className="chip">role</span>}
                      {em.mxFound && <span className="chip">MX ✓</span>}
                    </span>
                  </div>
                ))}
                {v.phones.map((ph) => (
                  <div key={ph.raw} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                    <span className="flex items-center gap-2">
                      <Phone size={13} className="text-muted" />
                      <span className="font-mono text-xs">{ph.national ?? ph.raw}</span>
                    </span>
                    <span className={`chip ${ph.valid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {ph.valid ? `valid ${ph.country ?? ""}` : "invalid"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Pending enrichment.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Website intelligence</h3>
            {e ? (
              <dl className="space-y-1.5">
                <Row label="Status">
                  {e.blocked
                    ? "Blocked by anti-bot protection, check manually"
                    : e.robotsDisallowed
                      ? "robots.txt disallows crawling, skipped"
                      : e.reachable
                        ? `Reachable (HTTP ${e.httpStatus})${e.cached ? " · cached" : ""}`
                        : e.error ?? "Unreachable"}
                </Row>
                {e.title && <Row label="Title">{e.title}</Row>}
                {e.description && <Row label="Description">{e.description}</Row>}
                {e.ownershipSignals.length > 0 && (
                  <Row label="Ownership">
                    <span className="text-red-700">{e.ownershipSignals.join("; ")}</span>
                  </Row>
                )}
                {e.techSignals.length > 0 && (
                  <Row label="Tech stack">
                    <span className="flex flex-wrap gap-1">
                      {e.techSignals.map((t) => (
                        <span key={t} className="chip">
                          {t}
                        </span>
                      ))}
                    </span>
                  </Row>
                )}
                <Row label="Signals">
                  <span className="flex flex-wrap gap-1">
                    {e.usesHttps && <span className="chip">HTTPS</span>}
                    {e.hasCareersPage && <span className="chip bg-emerald-50 text-emerald-700">Careers page</span>}
                    {e.hasBlog && <span className="chip">Blog / news</span>}
                    {Object.keys(e.socials).map((s) => (
                      <a key={s} href={e.socials[s]} target="_blank" rel="noreferrer" className="chip hover:bg-slate-200">
                        {s}
                      </a>
                    ))}
                  </span>
                </Row>
                {e.pagesScanned.length > 0 && (
                  <Row label="Pages scanned">
                    <span className="text-xs text-muted">{e.pagesScanned.length}: {e.pagesScanned.map((p) => new URL(p).pathname).join(", ")}</span>
                  </Row>
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted">Pending enrichment.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Outreach opener</h3>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={makeOpener}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-brand" />}
                {opener ? "Regenerate" : "Generate opener"}
              </button>
              {opener && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(opener);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            {opener && (
              <div className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-slate-50 p-3 text-sm leading-relaxed">{opener}</div>
            )}
            {openerSource && (
              <p className="mt-1 text-[11px] text-muted">
                {openerSource === "claude" ? "Personalized by Claude from the facts above." : "Template mode (set ANTHROPIC_API_KEY for AI personalization)."}
              </p>
            )}
          </section>
        </div>

        <footer className="border-t border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted">Status</label>
            <select
              className="select"
              value={lead.status}
              onChange={(e) => {
                const status = e.target.value as LeadStatus;
                onUpdate({ status });
                void patch({ status });
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="input mt-2 h-16 w-full resize-y text-sm"
            placeholder="Notes (saved when you click away)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (lead.notes ?? "")) void patch({ notes });
            }}
          />
        </footer>
      </aside>
    </>
  );
}
