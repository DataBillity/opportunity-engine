import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "../reset-form";

export const metadata: Metadata = {
  title: "DataBillity | Opportunity Engine | Prospects, Partners & Projects",
  description: "Choose a new Opportunity Engine password",
};

export default function ResetPasswordPage() {
  return (
    <>
      <div className="mb-7">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Set your password</h2>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Choose a password for the command center. You will be signed in after it is saved.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-5 sm:p-6">
        <Suspense
          fallback={
            <div className="space-y-4" aria-hidden>
              <div className="h-16 rounded-md bg-muted/70" />
              <div className="h-16 rounded-md bg-muted/70" />
              <div className="h-11 rounded-md bg-muted/70" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </>
  );
}
