import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ForgotPasswordForm } from "../forgot-form";

export const metadata: Metadata = {
  title: "DataBillity | Opportunity Engine | Prospects, Partners & Projects",
  description: "Set a new Opportunity Engine password",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="mb-7">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Forgot password?</h2>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Enter your authorized email and we will send a link to set a new password.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-5 sm:p-6">
        <Suspense
          fallback={
            <div className="space-y-4" aria-hidden>
              <div className="h-16 rounded-md bg-muted/70" />
              <div className="h-11 rounded-md bg-muted/70" />
            </div>
          }
        >
          <ForgotPasswordForm />
        </Suspense>
      </div>

      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        <Link href="/login" className="font-semibold text-foreground hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
