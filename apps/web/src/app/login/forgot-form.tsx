"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error || "Unable to send a reset email. Try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Unable to reach the command center. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground leading-relaxed">
          If that email is authorized, we sent a link to set a password. Check your inbox and spam folder.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The link expires in 60 minutes. You can close this tab after you open the email.
        </p>
        <Link href="/login" className="inline-flex text-sm font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  const canSubmit = email.trim().length > 0 && !pending;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="email"
          autoFocus
          spellCheck={false}
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@databillity.com"
          className="oe-field text-sm py-2.5"
          aria-invalid={Boolean(error)}
          required
        />
      </div>

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
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
