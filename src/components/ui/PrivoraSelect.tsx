import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export interface PrivoraSelectOption<T extends string> {
  value: T;
  label: string;
  meta?: string | number;
  disabled?: boolean;
}

interface PrivoraSelectProps<T extends string> {
  value: T;
  options: Array<PrivoraSelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
  align?: "left" | "right";
}

export function PrivoraSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Select",
  className,
  buttonClassName,
  menuClassName,
  disabled,
  align = "left",
}: PrivoraSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        className={cn(
          "inline-flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-[var(--privora-border)]/70 bg-[var(--privora-text)]/[0.015] px-3 text-left text-sm text-[var(--privora-text)] outline-none transition",
          "hover:border-[var(--privora-text)]/35 hover:bg-[var(--privora-text)]/[0.035] focus:border-[var(--privora-accent)] focus:bg-[var(--privora-text)]/[0.035]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isOpen && "border-[var(--privora-accent)] bg-[var(--privora-text)]/[0.04]",
          buttonClassName
        )}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-[var(--privora-muted)]")}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--privora-muted)] transition", isOpen && "rotate-180 text-[var(--privora-text)]")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.985 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute top-[calc(100%+6px)] z-[80] max-h-72 min-w-full overflow-y-auto rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-1.5 text-sm shadow-[var(--privora-shadow)] backdrop-blur-xl",
              align === "right" ? "right-0" : "left-0",
              menuClassName
            )}
          >
            {options.map(option => {
              const isActive = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition",
                    isActive
                      ? "bg-[var(--privora-text)] text-[var(--privora-bg)]"
                      : "text-[var(--privora-text)] hover:bg-[var(--privora-text)]/[0.055]",
                    option.disabled && "cursor-not-allowed opacity-45"
                  )}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    {option.meta !== undefined && (
                      <span className={cn("text-xs", isActive ? "text-[var(--privora-bg)]/70" : "text-[var(--privora-muted)]")}>{option.meta}</span>
                    )}
                    {isActive && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
