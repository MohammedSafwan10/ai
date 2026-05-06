import { MessageCircle, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { ChatRecord } from "../../../lib/db";

interface SearchModalProps {
  isOpen: boolean;
  chats: ChatRecord[];
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
}

export function SearchModal({ isOpen, chats, query, onQueryChange, onClose, onSelectChat }: SearchModalProps) {
  const matchingChats = chats.filter(chat => chat.title.toLowerCase().includes(query.toLowerCase()));

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
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-[15vh] left-1/2 -translate-x-1/2 w-full max-w-2xl z-[101] p-4 font-sans"
          >
            <div className="bg-[var(--privora-surface)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] border border-[var(--privora-border)]">
              <div className="flex items-center px-4 py-3 border-b border-[var(--privora-border)] gap-3 shrink-0">
                <Search className="w-5 h-5 text-[var(--privora-muted)]" />
                <input
                  type="text"
                  placeholder="Search chats and projects"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  autoFocus
                  className="flex-1 bg-transparent border-none outline-none text-[15px] text-[var(--privora-text)] placeholder-[var(--privora-muted)]"
                />
                <button
                  onClick={onClose}
                  className="p-1 rounded-md text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 transition-colors hidden sm:block"
                  title="Close search"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2">
                {matchingChats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    className="w-full flex justify-between items-center px-3 py-2.5 hover:bg-[var(--privora-text)]/5 rounded-xl transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3 w-full pr-4 overflow-hidden text-[14px]">
                      <MessageCircle className="w-4 h-4 text-[var(--privora-muted)] shrink-0" />
                      <span className="truncate text-[var(--privora-text)]">{chat.title}</span>
                    </div>
                    <span className="text-xs text-[var(--privora-muted)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                      Enter
                    </span>
                  </button>
                ))}
                {matchingChats.length === 0 && (
                  <div className="py-8 text-center text-sm text-[var(--privora-muted)]">No chats found.</div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
