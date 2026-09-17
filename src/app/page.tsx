import { Stepper } from "@/components/Stepper";
import { UploadCard } from "@/components/UploadCard";
import { BatchList } from "@/components/BatchList";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="space-y-5">
          <div className="space-y-3">
            <span className="chip bg-brand-soft text-brand-strong">Quality-first add-on for SaaSquatch Leads</span>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Know which leads deserve a credit <span className="text-brand">before</span> you spend one.
            </h1>
            <p className="max-w-xl text-[15px] leading-relaxed text-muted">
              Drop in a SaaSquatch export (or any lead CSV). LeadLens removes duplicates, scans each company&apos;s
              live website and domain record, verifies emails and phones, and ranks every lead for{" "}
              <strong className="font-semibold text-foreground">acquisition fit</strong>, with the reasons shown.
              Export the shortlist straight into your CRM.
            </p>
          </div>
          <Stepper current={1} />
          <ul className="grid gap-3 text-sm sm:grid-cols-3">
            {[
              ["Dedupe + normalize", "Domain and fuzzy-name matching collapses repeat rows so you never pay twice."],
              ["Enrich + verify", "Founded year, owner hints, ownership flags, tech stack, MX-checked emails, valid phones."],
              ["Score + export", "Tunable 0-100 acquisition-fit score with A/B/C/D tiers, CSV and HubSpot-ready export."],
            ].map(([title, body]) => (
              <li key={title} className="card p-4">
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
        <UploadCard />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Recent imports</h2>
          <p className="text-xs text-muted">Stored locally in SQLite (or Turso in the cloud)</p>
        </div>
        <BatchList />
      </section>
    </div>
  );
}
