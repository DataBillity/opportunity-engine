"use client";

import { useCallback, useEffect, useState } from "react";
import { useOperator } from "@/components/auth/operator-provider";
import { FormField, PrimaryButton, TextInput } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type KeyStatus = {
  configured: boolean;
  lastFour: string | null;
  usesPlatformKey: boolean;
  source: "customer" | "platform" | "missing";
  role?: "owner" | "member";
};

function statusCopy(status: KeyStatus): string {
  if (status.source === "customer" && status.lastFour) {
    return `Using a Claude key stored for this organization. Ending in ${status.lastFour}.`;
  }
  if (status.source === "platform") {
    return "Using the platform Claude key. An owner can replace it with this organization's own key.";
  }
  return "No Claude key is set. Outreach, extraction, and drafting stay blocked until an owner adds one.";
}

export function IntegrationsView() {
  const { profile } = useOperator();
  const { toast } = useToast();
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = profile?.role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/org/key", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json() as KeyStatus & { error?: string };
      if (!res.ok) {
        setError(data.error || "Unable to load the Claude key.");
        return;
      }
      setStatus(data);
      setError(null);
    } catch {
      setError("Unable to load the Claude key.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!apiKey.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/org/key", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anthropicApiKey: apiKey.trim() }),
      });
      const data = await res.json() as KeyStatus & { error?: string };
      if (!res.ok) {
        setError(data.error || "Unable to save that key.");
        return;
      }
      setApiKey("");
      setStatus({ ...data, role: profile?.role });
      toast("Claude key saved for this organization", "success");
    } catch {
      setError("Unable to save that key.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="oe-page-title">API & Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Claude calls for {profile?.organizationName || "this organization"} use the key stored here.
        </p>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-5 max-w-xl space-y-4">
        {error && (
          <p role="alert" className="text-xs text-destructive bg-[hsl(var(--status-nogo-soft))] border border-destructive/10 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        {loading || !status ? (
          <p className="text-sm text-muted-foreground">Loading key status…</p>
        ) : (
          <p className="text-sm text-foreground">{statusCopy(status)}</p>
        )}

        {isOwner ? (
          <form className="space-y-3" onSubmit={event => void save(event)}>
            <FormField label="Claude API key" hint="Checked with Anthropic before it is stored. The full key is not shown again.">
              <TextInput
                type="password"
                value={apiKey}
                onChange={setApiKey}
                placeholder="sk-ant-…"
              />
            </FormField>
            <PrimaryButton type="submit" disabled={saving || !apiKey.trim()}>
              {saving ? "Checking…" : "Replace key"}
            </PrimaryButton>
          </form>
        ) : (
          <p className="text-[12px] text-muted-foreground">Only an owner can replace the Claude key.</p>
        )}
      </div>
    </div>
  );
}
