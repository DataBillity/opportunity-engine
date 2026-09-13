"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeReturnPath } from "@/lib/auth-shared";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          from: safeReturnPath(searchParams.get("from")),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        setError(data.error || "Unable to sign in. Try again.");
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

  const canSubmit = username.trim().length > 0 && password.length > 0 && !pending;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="email"
          autoFocus
          spellCheck={false}
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="you@databillity.com"
          className="oe-field text-sm py-2.5"
          aria-invalid={Boolean(error)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="oe-field text-sm py-2.5 pr-12"
            aria-invalid={Boolean(error)}
            required
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
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
