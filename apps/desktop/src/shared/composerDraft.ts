import type { ContextMentionRecord, DesktopAttachmentRecord } from "./types";

export interface PastedDraftBlock { id: string; label: string; text: string; createdAt: number }
export interface ComposerDraftRecord {
  revision: string;
  text: string;
  attachments: DesktopAttachmentRecord[];
  contextMentions: ContextMentionRecord[];
  pastedBlocks: PastedDraftBlock[];
}
