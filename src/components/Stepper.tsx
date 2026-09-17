import { Check } from "lucide-react";

const STEPS = [
  { n: 1, title: "Import", body: "Upload a CSV, columns auto-map" },
  { n: 2, title: "Enrich & verify", body: "Live site scan, contact checks" },
  { n: 3, title: "Prioritize & export", body: "Tune weights, filter, ship to CRM" },
];

export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-2">
      {STEPS.map((s, i) => {
        const state = s.n < current ? "done" : s.n === current ? "active" : "todo";
        return (
          <li key={s.n} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                state === "active"
                  ? "border-brand bg-brand-soft/60"
                  : state === "done"
                    ? "border-border bg-surface"
                    : "border-dashed border-border bg-transparent"
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  state === "todo" ? "bg-slate-200 text-slate-600" : "bg-brand text-white"
                }`}
              >
                {state === "done" ? <Check size={14} strokeWidth={3} /> : s.n}
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-[11px] text-muted">{s.body}</p>
              </div>
            </div>
            {i < STEPS.length - 1 && <span className="hidden h-px w-4 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
