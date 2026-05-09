import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../../lib/utils";

type ToastVariant = "success" | "error" | "info";

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastRecord extends Required<Pick<ToastInput, "title" | "variant">> {
  id: string;
  description?: string;
  durationMs: number;
}

interface ToastContextValue {
  notify: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantIcon = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const variantClass = {
  success: "border-emerald-500/25 text-emerald-700 dark:text-emerald-300",
  error: "border-red-500/25 text-red-700 dark:text-red-300",
  info: "border-[var(--privora-border)] text-[var(--privora-text)]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timeoutsRef = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) window.clearTimeout(timeout);
    timeoutsRef.current.delete(id);
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const notify = useCallback((toast: ToastInput) => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const variant = toast.variant || "info";
    const durationMs = toast.durationMs ?? (variant === "error" ? 6500 : 2600);
    const nextToast: ToastRecord = {
      id,
      title: toast.title,
      description: toast.description,
      variant,
      durationMs,
    };

    setToasts(current => [nextToast, ...current.filter(item => item.title !== toast.title || item.description !== toast.description)].slice(0, 4));
    if (durationMs > 0) {
      const timeout = window.setTimeout(() => dismiss(id), durationMs);
      timeoutsRef.current.set(id, timeout);
    }
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions text"
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[200] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = variantIcon[toast.variant];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                role={toast.variant === "error" ? "alert" : "status"}
                className={cn(
                  "pointer-events-auto flex w-full max-w-[min(28rem,calc(100vw-1.5rem))] items-start gap-3 rounded-2xl border bg-[var(--privora-surface)]/95 px-3.5 py-3 shadow-2xl backdrop-blur-xl",
                  variantClass[toast.variant],
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold leading-snug text-[var(--privora-text)]">{toast.title}</div>
                  {toast.description && (
                    <div className="mt-0.5 text-[13px] leading-snug text-[var(--privora-muted)]">{toast.description}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/10 hover:text-[var(--privora-text)]"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
};
