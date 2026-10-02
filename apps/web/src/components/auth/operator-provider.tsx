"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { OperatorProfile } from "@/lib/operator-profile";

type OperatorContextValue = {
  profile: OperatorProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setProfile: (profile: OperatorProfile) => void;
};

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json() as {
        email?: string;
        displayName?: string;
        title?: string;
        organizationId?: string;
        organizationName?: string;
        role?: "owner" | "member";
        memberships?: { id: string; name: string; role: "owner" | "member" }[];
      };
      if (res.ok && data.email && data.organizationId) {
        setProfile({
          email: data.email,
          displayName: data.displayName ?? "",
          title: data.title ?? "",
          organizationId: data.organizationId,
          organizationName: data.organizationName ?? "Organization",
          role: data.role === "owner" ? "owner" : "member",
          memberships: data.memberships ?? [],
        });
      }
    } catch {
      /* keep prior profile if the session call fails */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ profile, loading, refresh, setProfile }),
    [profile, loading, refresh],
  );

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
}

export function useOperator() {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used within OperatorProvider");
  return ctx;
}
