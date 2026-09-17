"use client";

import { useState } from "react";
import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { DEFAULT_TARGET_INDUSTRIES, DEFAULT_WEIGHTS, type ScoreWeights } from "@/lib/types";

const LABELS: Record<keyof ScoreWeights, [string, string]> = {
  revenue: ["Revenue fit", "$1M-$10M scores highest"],
  employees: ["Headcount fit", "10-100 employees ideal"],
  maturity: ["Business maturity", "Founded year, copyright, domain age"],
  owner: ["Owner identified", "Named owner or founder hint"],
  contactability: ["Contactability", "MX-verified email, valid phone"],
  upside: ["Value-creation upside", "Under-invested digital stack"],
  industry: ["Industry fit", "Matches your target list"],
};

export function WeightsPanel({
  weights,
  targetIndustries,
  onApply,
}: {
  weights: ScoreWeights;
  targetIndustries: string[];
  onApply: (w: ScoreWeights, industries: string[]) => Promise<void>;
}) {
  const [w, setW] = useState<ScoreWeights>(weights);
  const [industries, setIndustries] = useState(targetIndustries.join(", "));
  const [busy, setBusy] = useState(false);
  const total = Object.values(w).reduce((a, b) => a + b, 0);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal size={15} className="text-brand" /> Scoring weights
        </h3>
        <button
          type="button"
          className="btn btn-ghost !px-2 !py-1 text-xs"
          onClick={() => {
            setW(DEFAULT_WEIGHTS);
            setIndustries(DEFAULT_TARGET_INDUSTRIES.join(", "));
          }}
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="space-y-3">
        {(Object.keys(LABELS) as (keyof ScoreWeights)[]).map((k) => (
          <label key={k} className="block">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium">{LABELS[k][0]}</span>
              <span className="font-mono text-muted">
                {w[k]} <span className="text-[10px]">({total ? Math.round((w[k] / total) * 100) : 0}%)</span>
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              value={w[k]}
              onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })}
              className="mt-1 w-full"
            />
            <p className="text-[10px] text-muted">{LABELS[k][1]}</p>
          </label>
        ))}
      </div>
      <label className="mt-4 block text-xs font-medium">
        Target industries <span className="font-normal text-muted">(comma separated)</span>
        <textarea
          className="input mt-1 h-20 w-full resize-y text-xs"
          value={industries}
          onChange={(e) => setIndustries(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={busy}
        className="btn btn-primary mt-3 w-full justify-center"
        onClick={async () => {
          setBusy(true);
          try {
            await onApply(
              w,
              industries
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null} Re-score all leads
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Weights are normalized to 100. Penalties (PE/corporate ownership -20, unreachable site -10, no website -5) apply
        on top.
      </p>
    </div>
  );
}
