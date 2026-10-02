import { Suspense } from "react";
import { InviteForm } from "./invite-form";

export default function InvitePage() {
  return (
    <>
      <div className="mb-7">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Accept invite</h2>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Set a password to join this organization.
        </p>
      </div>
      <div className="bg-card border border-border rounded-xl shadow-sm p-5 sm:p-6">
        <Suspense fallback={<div className="h-24 rounded-md bg-muted/70" />}>
          <InviteForm />
        </Suspense>
      </div>
    </>
  );
}
