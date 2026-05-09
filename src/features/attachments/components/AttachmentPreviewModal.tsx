import { motion, AnimatePresence } from "motion/react";
import type { Attachment } from "../../../lib/attachments";
import { useToast } from "../../ui/ToastProvider";

interface AttachmentPreviewModalProps {
  attachment: Attachment | null;
  onClose: () => void;
}

export function AttachmentPreviewModal({ attachment, onClose }: AttachmentPreviewModalProps) {
  const { notify } = useToast();

  return (
    <AnimatePresence>
      {attachment && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <button
            className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={onClose}
            title="Close preview"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative max-w-5xl max-h-[85vh] w-full flex flex-col items-center gap-4"
            onClick={event => event.stopPropagation()}
          >
            {attachment.mimeType.startsWith("image/") ? (
              <img
                src={attachment.url}
                alt={attachment.name}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-48 h-48 sm:w-64 sm:h-64 flex flex-col items-center justify-center gap-4 bg-[var(--privora-surface)] rounded-2xl shadow-2xl border border-[var(--privora-border)] p-6 text-center">
                <div className="text-[var(--privora-text)] opacity-70">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                </div>
                <span className="font-medium text-[var(--privora-text)] break-all line-clamp-3">{attachment.name}</span>
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => notify({ title: "Download started", description: "Attachment file is being downloaded.", variant: "success" })}
                  className="px-4 py-2 mt-2 bg-[var(--privora-accent)] text-[var(--privora-accent-fg)] rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                  download={attachment.name}
                >
                  Download File
                </a>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
