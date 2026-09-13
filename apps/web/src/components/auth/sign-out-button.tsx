"use client";

import { useState, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { signOutToLogin } from "@/lib/sign-out";

export function SignOutButton({
  className,
  idleLabel = "Sign out",
  ...props
}: {
  className?: string;
  idleLabel?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type">) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      {...props}
      disabled={pending || props.disabled}
      onClick={() => {
        if (pending) return;
        setPending(true);
        void signOutToLogin();
      }}
      className={cn("cursor-pointer transition-all disabled:opacity-60 disabled:cursor-wait", className)}
    >
      {pending ? "Signing out…" : idleLabel}
    </button>
  );
}
