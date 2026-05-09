import type { AttachmentRecord, ChatMessageRecord, ChatRecord } from "./db";

export type Attachment = AttachmentRecord;
export type MessageWithAttachments = ChatMessageRecord;
export type ChatWithAttachments = ChatRecord;

export const MAX_ATTACHMENTS = 15;
export const CLIPROXY_MAX_ATTACHMENT_PAYLOAD_BYTES = 50 * 1024 * 1024;
export const GEMINI_MAX_INLINE_PAYLOAD_BYTES = 20 * 1024 * 1024;
export const OPENROUTER_ATTACHMENT_ACCEPT = "";

const CLIPROXY_VISION_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const CLIPROXY_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
  "text/tsv",
  "application/json",
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/typescript",
  "text/x-typescript",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/rtf",
  "text/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const CLIPROXY_FILE_EXTENSIONS = new Set([
  "pdf", "txt", "md", "markdown", "json", "html", "htm", "xml", "csv", "tsv",
  "doc", "docx", "rtf", "odt", "ppt", "pptx", "xls", "xlsx",
  "js", "jsx", "ts", "tsx", "py", "java", "cs", "cpp", "c", "css", "sql",
  "log", "yml", "yaml", "toml", "ini", "sh", "bat", "ps1", "dart", "go", "rs",
]);
const GEMINI_ATTACHMENT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/xml",
  "application/xml",
  "application/json",
  "text/csv",
  "application/csv",
]);
const GEMINI_ATTACHMENT_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "heic", "heif", "pdf", "txt", "md", "markdown",
  "html", "htm", "xml", "json", "csv", "tsv", "js", "jsx", "ts", "tsx", "py",
  "java", "cs", "cpp", "c", "css", "sql", "log", "yml", "yaml", "toml", "ini",
  "sh", "bat", "ps1", "dart", "go", "rs",
]);

export const GEMINI_ATTACHMENT_ACCEPT =
  "image/*,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.java,.cs,.cpp,.c,.html,.css";
export const CLIPROXY_ATTACHMENT_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.json,.html,.htm,.xml,.csv,.tsv,.doc,.docx,.rtf,.odt,.ppt,.pptx,.xls,.xlsx,.js,.jsx,.ts,.tsx,.py,.java,.cs,.cpp,.c,.css,.sql,.log,.yml,.yaml,.toml,.ini,.sh,.bat,.ps1,.dart,.go,.rs";

export const getAttachmentDataUrl = (attachment: Pick<Attachment, "mimeType" | "base64">) =>
  `data:${attachment.mimeType || "application/octet-stream"};base64,${attachment.base64}`;

export const normalizeAttachmentUrl = (attachment: Attachment): Attachment => {
  if (!attachment.url || attachment.url.startsWith("blob:")) {
    return { ...attachment, url: getAttachmentDataUrl(attachment) };
  }

  return attachment;
};

export const normalizeAttachmentUrls = (items: Attachment[] = []) => items.map(normalizeAttachmentUrl);

export const normalizeMessageAttachmentUrls = (message: MessageWithAttachments): MessageWithAttachments =>
  message.attachments ? { ...message, attachments: normalizeAttachmentUrls(message.attachments) } : message;

export const normalizeChatAttachmentUrls = (chat: ChatWithAttachments): ChatWithAttachments => ({
  ...chat,
  messages: chat.messages.map(normalizeMessageAttachmentUrls),
});

export const revokeAttachmentUrl = (attachment: Attachment) => {
  if (attachment.url.startsWith("blob:")) {
    URL.revokeObjectURL(attachment.url);
  }
};

export const getAttachmentSize = (attachment: Attachment) => {
  if (typeof attachment.size === "number") return attachment.size;
  return Math.ceil((attachment.base64.length * 3) / 4);
};

export const getAttachmentTotalSize = (items: Attachment[]) =>
  items.reduce((total, attachment) => total + getAttachmentSize(attachment), 0);

export const getAttachmentExtension = (name: string) => name.split(".").pop()?.toLowerCase() || "";

export const isCliproxySupportedAttachment = (attachment: Pick<Attachment, "mimeType" | "name">) =>
  CLIPROXY_VISION_MIME_TYPES.has(attachment.mimeType) ||
  CLIPROXY_FILE_MIME_TYPES.has(attachment.mimeType) ||
  CLIPROXY_FILE_EXTENSIONS.has(getAttachmentExtension(attachment.name));

export const isGeminiSupportedAttachment = (attachment: Pick<Attachment, "mimeType" | "name">) =>
  attachment.mimeType.startsWith("image/") ||
  GEMINI_ATTACHMENT_MIME_TYPES.has(attachment.mimeType) ||
  GEMINI_ATTACHMENT_EXTENSIONS.has(getAttachmentExtension(attachment.name));

export const validateCliproxyAttachments = (items: Attachment[]) => {
  const unsupported = items.find(attachment => !isCliproxySupportedAttachment(attachment));
  if (unsupported) {
    return `GPT-5.5 through CLIProxy supports images and common document/text/code files. Remove "${unsupported.name}" or switch to Gemini for this file type.`;
  }

  if (getAttachmentTotalSize(items) > CLIPROXY_MAX_ATTACHMENT_PAYLOAD_BYTES) {
    return "GPT file input is limited to 50 MB total per request in this app. Remove or compress one file.";
  }

  return null;
};

export const validateGeminiAttachments = (items: Attachment[]) => {
  const unsupported = items.find(attachment => !isGeminiSupportedAttachment(attachment));
  if (unsupported) {
    return `Gemini supports images, PDFs, and common text/code files here. Remove "${unsupported.name}" or convert it to PDF/text first.`;
  }

  if (getAttachmentTotalSize(items) > GEMINI_MAX_INLINE_PAYLOAD_BYTES) {
    return "Gemini inline uploads are kept under 20 MB in this app. Use smaller files for now.";
  }

  return null;
};

export const validateOpenRouterAttachments = (items: Attachment[]) => {
  if (items.length > 0) {
    return "These OpenRouter free models are text-only in Privora right now. Remove attachments or switch to Gemini/GPT for files and vision.";
  }

  return null;
};

export const readFileAsAttachment = (file: File) =>
  new Promise<Attachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result !== "string") {
        reject(new Error(`Could not read ${file.name}.`));
        return;
      }

      const attachment = {
        base64: result.split(",")[1] || "",
        mimeType: file.type || "application/octet-stream",
        name: file.name,
        size: file.size,
      };
      resolve({
        ...attachment,
        url: getAttachmentDataUrl(attachment),
      });
    };
    reader.readAsDataURL(file);
  });
