"use client";

import { useEffect, useState } from "react";
import { useOperator } from "@/components/auth/operator-provider";
import { FormField, PrimaryButton, TextInput } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { operatorLabel } from "@/lib/operator-profile";

export function SettingsView() {
  const { profile, loading, setProfile } = useOperator();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setTitle(profile.title);
  }, [profile]);

  async function handleSave() {
    const name = displayName.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name, title: title.trim() }),
      });
      const data = await res.json() as { email?: string; displayName?: string; title?: string; error?: string };
      if (!res.ok) {
        setError(data.error || "Unable to save profile.");
        return;
      }
      setProfile({
        email: data.email ?? profile?.email ?? "",
        displayName: data.displayName ?? name,
        title: data.title ?? title.trim(),
      });
      toast("Profile saved — outreach will sign with this name", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const previewName = displayName.trim() || (profile ? operatorLabel(profile) : "Your name");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="oe-page-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your operator profile. Outreach drafts and new notes use this name instead of a placeholder.
        </p>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-5 max-w-xl">
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            void handleSave();
          }}
        >
        <div>
          <h2 className="text-sm font-semibold text-foreground">Profile</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Signed in as {profile?.email ?? "your Databillity account"}.
          </p>
        </div>

        <FormField label="Full name" hint="Used as the sender on outreach emails, for example “Bryan Guy here from DataBillity.”">
          <TextInput
            value={displayName}
            onChange={setDisplayName}
            placeholder="e.g. Bryan Guy"
          />
        </FormField>

        <FormField label="Title (optional)" hint="Included next to your name on decision records and in the outreach briefing.">
          <TextInput
            value={title}
            onChange={setTitle}
            placeholder="e.g. Founder"
          />
        </FormField>

        <div className="text-[12px] text-muted-foreground rounded-md border border-border bg-muted/30 px-3 py-2">
          Preview signature: <span className="text-foreground font-medium">{previewName}</span>
          {title.trim() ? ` · ${title.trim()}` : ""} at DataBillity
        </div>

        {error && (
          <div className="text-xs text-nogo bg-nogo-soft border border-nogo/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <PrimaryButton type="submit" disabled={saving || loading || !displayName.trim()}>
            {saving ? "Saving…" : "Save profile"}
          </PrimaryButton>
        </div>
        </form>
      </div>
    </div>
  );
}
