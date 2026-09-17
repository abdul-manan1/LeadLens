import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Telescope } from "lucide-react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeadLens · Acquisition-fit scoring for SaaSquatch leads",
  description:
    "Import a SaaSquatch lead export, enrich and verify every company from live public data, then rank them for acquisition fit before you spend a credit or make a call.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
                <Telescope size={18} strokeWidth={2.2} />
              </span>
              <span className="text-[15px]">LeadLens</span>
              <span className="hidden text-xs font-medium text-muted sm:inline">for SaaSquatch Leads</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="btn btn-ghost">
                Imports
              </Link>
              <a href="/api/health" className="btn btn-ghost" target="_blank" rel="noreferrer">
                API
              </a>
              <a
                href="https://www.saasquatchleads.com/"
                className="btn btn-ghost"
                target="_blank"
                rel="noreferrer"
              >
                SaaSquatch ↗
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="border-t border-border py-4 text-center text-xs text-muted">
          LeadLens · Built for the Caprae Capital AI-Readiness Challenge · Public data only, robots.txt respected
        </footer>
      </body>
    </html>
  );
}
