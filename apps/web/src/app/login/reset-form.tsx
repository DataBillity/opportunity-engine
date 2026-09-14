"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-shared";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!token) {
        setLinkError("This reset link is invalid or has expired.");
        setChecking(false);
        return;
      }
      try {
        const res = await fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`);
        const data = (await res.json().catch(() => ({}))) as { error?: string; email?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLinkError(data.error || "This reset link is invalid or has expired.");
          return;
        }
        setEmail(data.email ?? null);
      } catch {
        if (!cancelled) setLinkError("Unable to verify this reset link. Try again.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        setError(data.error || "Unable to set that password. Try again.");
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

  if (checking) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-16 rounded-md bg-muted/70" />
        <div className="h-16 rounded-md bg-muted/70" />
        <div className="h-11 rounded-md bg-muted/70" />
      </div>
    );
  }

  if (linkError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-xs text-destructive bg-[hsl(var(--status-nogo-soft))] border border-destructive/10 rounded-md px-3 py-2">
          {linkError}
        </p>
        <Link href="/login/forgot" className="inline-flex text-sm font-semibold text-primary hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH && confirm.length > 0 && !pending;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {email && (
        <p className="text-xs text-muted-foreground">
          Setting a password for <span className="font-semibold text-foreground">{email}</span>
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            className="oe-field text-sm py-2.5 pr-12"
            aria-invalid={Boolean(error)}
            required
            minLength={MIN_PASSWORD_LENGTH}
          />
          <button
            type="button"
            onClick={() => setShowPassword(open => !open)}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-2 rounded-md text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Re-enter your password"
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
        {pending ? "Saving…" : "Set password and sign in"}
      </button>
    </form>
  );
}
