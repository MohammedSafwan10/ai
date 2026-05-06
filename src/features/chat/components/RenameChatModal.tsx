import type { FormEvent, KeyboardEvent, MouseEvent, RefObject } from "react";
import { Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface RenameChatModalProps {
  isOpen: boolean;
  title: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onTitleChange: (title: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function RenameChatModal({
  isOpen,
  title,
  inputRef,
  onTitleChange,
  onClose,
  onSubmit,
}: RenameChatModalProps) {
  const handleFormClick = (event: MouseEvent<HTMLFormElement>) => {
    event.stopPropagation();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ type: "spring", damping: 25, stiffness: 320 }}
            className="fixed inset-x-0 top-[20vh] z-[101] mx-auto w-full max-w-md px-4 font-sans"
          >
            <form
              onSubmit={onSubmit}
              onClick={handleFormClick}
              className="overflow-hidden rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-[var(--privora-border)] px-5 py-4">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--privora-text)]/5 text-[var(--privora-text)]">
                  <Pencil className="h-4 w-4" />
                </div>
                <h2 className="min-w-0 text-[15px] font-medium text-[var(--privora-text)]">Rename chat</h2>
              </div>
              <div className="space-y-4 px-5 py-5">
                <input
                  ref={inputRef}
                  type="text"
                  value={title}
                  onChange={(event) => onTitleChange(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  maxLength={80}
                  className="w-full rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] px-4 py-3 text-[15px] text-[var(--privora-text)] outline-none transition-colors placeholder:text-[var(--privora-muted)] focus:border-[var(--privora-text)]/30 focus:bg-[var(--privora-surface)]"
                  placeholder="Chat title"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!title.trim()}
                    className="rounded-xl bg-[var(--privora-text)] px-4 py-2.5 text-sm font-medium text-[var(--privora-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
