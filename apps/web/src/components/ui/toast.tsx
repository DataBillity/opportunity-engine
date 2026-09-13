"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/cn";

interface Toast {
  id: number;
  message: string;
  type: "success" | "info" | "warning" | "error";
}

interface ToastContextValue {
  toast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 inset-x-3 z-[100] flex flex-col gap-2 pointer-events-none sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto px-4 py-3 rounded-xl shadow-lg border text-xs font-medium animate-slide-up",
              t.type === "success" && "bg-[hsl(var(--status-go-soft))] text-[hsl(var(--status-go))] border-[hsl(var(--status-go))]/20",
              t.type === "info" && "bg-accent text-primary border-primary/20",
              t.type === "warning" && "bg-[hsl(var(--status-cond-soft))] text-[hsl(var(--status-cond))] border-[hsl(var(--status-cond))]/20",
              t.type === "error" && "bg-[hsl(var(--status-nogo-soft))] text-[hsl(var(--status-nogo))] border-[hsl(var(--status-nogo))]/20",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
