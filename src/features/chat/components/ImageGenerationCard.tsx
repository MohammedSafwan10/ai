import { Download, ExternalLink, Pencil, RotateCcw } from "lucide-react";
import { getAttachmentDataUrl, type Attachment } from "../../../lib/attachments";
import type { ImageGenerationRecord } from "../../../lib/db";
import { cn } from "../../../lib/utils";
import { useToast } from "../../ui/ToastProvider";

interface ImageGenerationCardProps {
  imageGeneration: ImageGenerationRecord;
  attachments?: Attachment[];
  onPreview?: (attachment: Attachment) => void;
  onRetry?: () => void;
  onEditImage?: (attachment: Attachment) => void;
}

const downloadAttachment = (attachment: Attachment) => {
  const link = document.createElement("a");
  link.href = getAttachmentDataUrl(attachment);
  link.download = attachment.name || "privora-image.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export function ImageGenerationCard({
  imageGeneration,
  attachments = [],
  onPreview,
  onRetry,
  onEditImage,
}: ImageGenerationCardProps) {
  const { notify } = useToast();
  const isRunning = imageGeneration.status === "queued" || imageGeneration.status === "generating";
  const items = imageGeneration.items?.length
    ? imageGeneration.items
    : [{
        id: "legacy",
        status: imageGeneration.status,
        partialImageBase64: imageGeneration.partialImageBase64,
        outputFormat: imageGeneration.outputFormat,
        attachmentName: attachments[0]?.name,
        error: imageGeneration.error,
        completedAt: imageGeneration.completedAt,
      }];
  const statusLabel = imageGeneration.status === "stopped" ? "Image generation stopped" : "Image generation failed";
  const getAttachmentForItem = (itemIndex: number, attachmentName?: string) =>
    attachmentName
      ? attachments.find(attachment => attachment.name === attachmentName) || attachments[itemIndex]
      : attachments[itemIndex];
  const maxWidthClass = items.length === 1 ? "max-w-[26rem]" : "max-w-[32rem]";

  return (
    <div className={cn(
      "w-full overflow-hidden rounded-2xl text-[var(--privora-text)]",
      maxWidthClass,
      isRunning
        ? "border border-[var(--privora-border)]/45 bg-transparent shadow-none"
        : imageGeneration.status === "completed"
          ? "bg-transparent shadow-none"
          : "border border-[var(--privora-border)] bg-[var(--privora-surface)] shadow-[var(--privora-shadow)]"
    )}>
      {!isRunning && imageGeneration.status !== "completed" && (
      <div className="flex items-center justify-between gap-3 border-b border-[var(--privora-border)]/70 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">{statusLabel}</div>
          </div>
        </div>
      </div>
      )}

      <div className={cn("grid gap-2", items.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
        {items.map((item, index) => {
          const attachment = getAttachmentForItem(index, item.attachmentName);
          const itemRunning = item.status === "queued" || item.status === "generating";
          const partialSrc = itemRunning && item.partialImageBase64
            ? `data:image/${item.outputFormat || imageGeneration.outputFormat || "png"};base64,${item.partialImageBase64}`
            : undefined;
          const completedSrc = attachment ? getAttachmentDataUrl(attachment) : undefined;
          const previewSrc = completedSrc || partialSrc;

          return (
            <div key={item.id || index} className="group relative">
              <button
                type="button"
                disabled={!attachment}
                onClick={() => attachment && onPreview?.(attachment)}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-2xl text-left",
                  imageGeneration.status === "completed"
                    ? "bg-transparent"
                    : "bg-[var(--privora-bg)]",
                  !attachment && "cursor-default"
                )}
              >
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt=""
                    className={cn("h-full w-full object-cover", itemRunning && "opacity-85")}
                  />
                ) : (
                  <div className="h-full w-full privora-image-shimmer">
                    <span className="privora-image-shimmer-orb privora-image-shimmer-orb-a" />
                    <span className="privora-image-shimmer-orb privora-image-shimmer-orb-b" />
                    <span className="privora-image-shimmer-orb privora-image-shimmer-orb-c" />
                  </div>
                )}
                {itemRunning && (
                  <>
                    <div className="absolute inset-0 privora-image-vignette" />
                    <div className="absolute inset-0 privora-image-sheen" />
                  </>
                )}
              </button>

              {!isRunning && imageGeneration.status === "completed" && attachment && (
                <div className="mt-2 flex items-center gap-3 px-1 text-[var(--privora-muted)] transition-colors duration-500">
                  <button type="button" onClick={() => onPreview?.(attachment)} className="privora-image-action" title="Open image">
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => { downloadAttachment(attachment); notify({ title: "Download started", description: "Image file is being downloaded.", variant: "success" }); }} className="privora-image-action" title="Download PNG">
                    <Download className="h-4 w-4" />
                  </button>
                  {onEditImage && (
                    <button type="button" onClick={() => onEditImage(attachment)} className="privora-image-action" title="Edit this image">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {onRetry && (
                    <button type="button" onClick={onRetry} className="privora-image-action" title="Retry">
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isRunning && (
      <div className={cn(
        imageGeneration.status === "completed" ? "hidden" : "space-y-3 px-3.5 py-3"
      )}>
        {imageGeneration.status === "failed" && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-300">
            {imageGeneration.error || "Image generation failed. Try again in a moment."}
          </p>
        )}

        {(imageGeneration.status === "stopped" || imageGeneration.status === "failed") && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--privora-border)] px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--privora-user-bubble)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </div>
      )}
    </div>
  );
}
