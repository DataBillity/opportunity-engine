"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-shared";

export function InviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [email, setEmail] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!token) {
        setLinkError("This invite link is invalid or has expired.");
        setChecking(false);
        return;
      }
      try {
        const res = await fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`);
        const data = (await res.json().catch(() => ({}))) as { error?: string; email?: string; organizationName?: string; hasPassword?: boolean };
        if (cancelled) return;
        if (!res.ok) {
          setLinkError(data.error || "This invite link is invalid or has expired.");
          return;
        }
        setEmail(data.email ?? null);
        setOrganizationName(data.organizationName ?? "");
        setHasPassword(Boolean(data.hasPassword));
      } catch {
        if (!cancelled) setLinkError("Unable to verify this invite. Try again.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirm, displayName }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        setError(data.error || "Unable to accept this invite.");
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

  if (checking) return <div className="h-24 rounded-md bg-muted/70" aria-busy />;
  if (linkError) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">{linkError}</p>
        <Link href="/login" className="text-sm font-semibold text-primary hover:underline">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Join <span className="font-semibold text-foreground">{organizationName}</span> as {email}.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Your name</span>
        <input value={displayName} onChange={event => setDisplayName(event.target.value)} className="oe-field text-sm py-2.5" />
      </label>
      {hasPassword ? (
        <p className="text-sm text-muted-foreground">You already have a password. Accepting this invite adds this organization to your account.</p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Password</span>
            <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="oe-field text-sm py-2.5" required />
            <span className="text-[11px] text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Confirm password</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} className="oe-field text-sm py-2.5" required />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive bg-[hsl(var(--status-nogo-soft))] border border-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || (!hasPassword && password.length < MIN_PASSWORD_LENGTH)}
        className="w-full text-sm font-semibold px-4 py-2.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50 min-h-11"
      >
        {pending ? "Joining…" : "Join organization"}
      </button>
    </form>
  );
}
