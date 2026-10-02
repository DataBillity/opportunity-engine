"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-shared";

export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, displayName, email, password, anthropicApiKey }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        setError(data.error || "Unable to create the organization.");
        return;
      }
      router.replace(data.redirectTo || "/");
      router.refresh();
    } catch {
      setError("Unable to reach the command center. Try again.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit = companyName.trim().length > 1
    && displayName.trim().length > 0
    && email.includes("@")
    && password.length >= MIN_PASSWORD_LENGTH
    && anthropicApiKey.trim().startsWith("sk-ant-")
    && !pending;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="flex items-center gap-2.5 px-5 h-14 shrink-0 bg-[var(--billity-navy)] text-white shadow-md">
        <BrandMark height={28} />
        <div className="font-bold tracking-tight text-[15px]">Opportunity Engine</div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[440px]">
          <div className="mb-7">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Create an organization</h1>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Your team will share one workspace. Claude calls use the key you enter here, not the platform key.
            </p>
          </div>
          <form onSubmit={onSubmit} className="bg-card border border-border rounded-xl shadow-sm p-5 sm:p-6 space-y-4">
            <Field label="Organization" id="company">
              <input id="company" value={companyName} onChange={event => setCompanyName(event.target.value)} className="oe-field text-sm py-2.5" required />
            </Field>
            <Field label="Your name" id="name">
              <input id="name" value={displayName} onChange={event => setDisplayName(event.target.value)} className="oe-field text-sm py-2.5" required />
            </Field>
            <Field label="Email" id="email">
              <input id="email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="oe-field text-sm py-2.5" required />
            </Field>
            <Field label="Password" id="password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
              <input id="password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="oe-field text-sm py-2.5" required />
            </Field>
            <Field label="Claude API key" id="key" hint="Checked with Anthropic before the organization is created.">
              <input id="key" type="password" autoComplete="off" value={anthropicApiKey} onChange={event => setAnthropicApiKey(event.target.value)} placeholder="sk-ant-…" className="oe-field text-sm py-2.5" required />
            </Field>
            {error && (
              <p role="alert" className="text-xs text-destructive bg-[hsl(var(--status-nogo-soft))] border border-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full text-sm font-semibold px-4 py-2.5 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-11"
            >
              {pending ? "Creating…" : "Create organization"}
            </button>
          </form>
          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            Already have an account? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
