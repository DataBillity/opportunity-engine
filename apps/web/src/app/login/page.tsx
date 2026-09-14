import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

function FormFallback() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-16 rounded-md bg-muted/70" />
      <div className="h-16 rounded-md bg-muted/70" />
      <div className="h-11 rounded-md bg-muted/70" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <div className="mb-7">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign in</h2>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Use your Databillity email and password to continue.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-5 sm:p-6">
        <Suspense fallback={<FormFallback />}>
          <SignInForm />
        </Suspense>
      </div>

      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        Authorized Databillity operators only.
      </p>
    </>
  );
}
