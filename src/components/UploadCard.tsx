"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Sparkles, UploadCloud } from "lucide-react";

const SAMPLES = [
  { file: "/samples/sample_leads.csv", label: "Real SMB sample (24 live sites)", hint: "Best for seeing enrichment work" },
  { file: "/samples/saasquatch_style_export.csv", label: "SaaSquatch-style export (synthetic)", hint: "Shows mapping, dedupe & scoring" },
];

export function UploadCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const submit = useCallback(
    async (form: FormData) => {
      setError(null);
      try {
        const res = await fetch("/api/batches", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Import failed");
        router.push(`/batches/${json.batch.id}?autostart=1`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
        setBusy(null);
      }
    },
    [router],
  );

  const onFile = useCallback(
    (file: File) => {
      if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
        setError("Please upload a .csv file.");
        return;
      }
      setBusy(file.name);
      const form = new FormData();
      form.append("file", file);
      if (name.trim()) form.append("name", name.trim());
      void submit(form);
    },
    [name, submit],
  );

  const loadSample = useCallback(
    async (path: string, label: string) => {
      setBusy(label);
      setError(null);
      try {
        const text = await (await fetch(path)).text();
        const form = new FormData();
        form.append("text", text);
        form.append("name", name.trim() || label);
        await submit(form);
      } catch {
        setError("Could not load sample.");
        setBusy(null);
      }
    },
    [name, submit],
  );

  return (
    <div className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <FileSpreadsheet size={18} className="text-brand" />
        <h2 className="font-semibold">Import leads</h2>
      </div>

      <label className="mb-3 block text-xs font-medium text-muted">
        Batch name <span className="font-normal">(optional)</span>
        <input
          className="input mt-1 w-full"
          placeholder="e.g. Texas HVAC targets · Sept"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
          drag ? "border-brand bg-brand-soft/50" : "border-border hover:border-brand/60 hover:bg-slate-50"
        }`}
      >
        {busy ? <Loader2 className="animate-spin text-brand" /> : <UploadCloud className="text-brand" />}
        <p className="text-sm font-medium">{busy ? `Importing ${busy}…` : "Drop a CSV here or click to browse"}</p>
        <p className="text-xs text-muted">
          Works with SaaSquatch exports. Needs at least a company or website column; everything else is optional.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="mt-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
          <Sparkles size={13} /> No file handy? Try a sample:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <button
              key={s.file}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => loadSample(s.file, s.label)}
              className="btn btn-secondary h-auto flex-col items-start gap-0.5 py-2.5 text-left"
            >
              <span>{s.label}</span>
              <span className="text-[11px] font-normal text-muted">{s.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
