import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Opportunity Engine",
  description: "Sign in to the Opportunity Engine command center",
};

const highlights = [
  { title: "Pipeline", body: "See the right organizations and projects in one command center." },
  { title: "Decision", body: "Confirm Go / No-Go with scored evidence, not a gut call." },
  { title: "Response", body: "Draft a complete, partner-ready offer against the live requirement map." },
];

function FormFallback() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-16 rounded-md bg-muted/70" />
      <div className="h-16 rounded-md bg-muted/70" />
      <div className="h-11 rounded-md bg-muted/70" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-background">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[var(--billity-navy)] text-white px-10 xl:px-14 py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 90% 0%, rgba(2,175,239,0.45), transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(150,224,255,0.18), transparent 45%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: "radial-gradient(rgba(150,224,255,0.9) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <BrandMark size={36} />
            <div>
              <div className="font-bold tracking-tight text-[17px] leading-tight">Opportunity Engine</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/55 font-semibold mt-0.5">
                Command Center
              </div>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl xl:text-4xl font-bold tracking-tight leading-tight">
            See the right projects.
            <span className="block text-[var(--billity-sky)]">Decide with evidence.</span>
          </h1>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            Unified bid management for Databillity — from first signal through Go / No-Go to a complete response.
          </p>
          <ul className="mt-8 space-y-4">
            {highlights.map(item => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 w-6 h-6 rounded-md bg-white/10 text-[var(--billity-bright)] flex items-center justify-center shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <span>
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className="block text-[13px] text-white/65 leading-relaxed mt-0.5">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] uppercase tracking-[0.16em] text-white/40 font-semibold">
          Databillity · Authorized access
        </p>
      </aside>

      <main className="flex flex-col min-h-dvh">
        <header className="lg:hidden flex items-center gap-2.5 px-5 h-14 shrink-0 bg-[var(--billity-navy)] text-white shadow-md">
          <BrandMark size={28} />
          <div className="min-w-0">
            <div className="font-bold tracking-tight text-[15px] leading-tight truncate">Opportunity Engine</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/55 font-semibold">Command Center</div>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[400px] animate-slide-up">
            <div className="mb-7">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign in</h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Use your Databillity credentials to access the command center.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm p-5 sm:p-6">
              <Suspense fallback={<FormFallback />}>
                <SignInForm />
              </Suspense>
            </div>

            <p className="mt-5 text-center text-[11px] text-muted-foreground">
              Authorized Databillity operators only.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
