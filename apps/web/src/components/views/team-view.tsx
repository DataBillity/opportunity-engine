"use client";

import { useCallback, useEffect, useState } from "react";
import { useOperator } from "@/components/auth/operator-provider";
import { FormField, PrimaryButton, TextInput } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Member = {
  email: string;
  role: "owner" | "member";
  status: "active" | "invited";
};

export function TeamView() {
  const { profile } = useOperator();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = profile?.role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/org/members", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json() as { members?: Member[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Unable to load the team.");
        return;
      }
      setMembers(data.members ?? []);
      setError(null);
    } catch {
      setError("Unable to load the team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    const next = email.trim().toLowerCase();
    if (!next || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/org/invites", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: next }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error || "Unable to send that invite.");
        return;
      }
      setEmail("");
      toast(`Invite sent to ${next}`, "success");
      await load();
    } catch {
      setError("Unable to send that invite.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(target: string) {
    setError(null);
    try {
      const res = await fetch(`/api/org/members?email=${encodeURIComponent(target)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error || "Unable to remove that teammate.");
        return;
      }
      toast(`Removed ${target}`, "success");
      await load();
    } catch {
      setError("Unable to remove that teammate.");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="oe-page-title">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          People in {profile?.organizationName || "this organization"} share one pipeline, partner network, and plays list.
        </p>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-5 max-w-2xl space-y-4">
        {error && (
          <p role="alert" className="text-xs text-destructive bg-[hsl(var(--status-nogo-soft))] border border-destructive/10 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading team…</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map(member => (
              <li key={member.email} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{member.email}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">
                    {member.role} · {member.status}
                  </div>
                </div>
                {isOwner && member.email !== profile?.email && (
                  <button
                    type="button"
                    onClick={() => void remove(member.email)}
                    className="text-xs font-semibold text-destructive hover:underline shrink-0"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <form className="space-y-3 pt-2 border-t border-border" onSubmit={event => void invite(event)}>
            <FormField label="Invite by email" hint="They get a link to set a password and join this organization.">
              <TextInput
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="teammate@company.com"
              />
            </FormField>
            <PrimaryButton type="submit" disabled={saving || !email.trim()}>
              {saving ? "Sending…" : "Send invite"}
            </PrimaryButton>
          </form>
        ) : (
          <p className="text-[12px] text-muted-foreground">Only an owner can invite or remove teammates.</p>
        )}
      </div>
    </div>
  );
}
