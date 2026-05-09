import { FileCode2, FileText, Maximize2, Sparkles } from "lucide-react";
import type { ArtifactReferenceRecord } from "../../../lib/db";
import { cn } from "../../../lib/utils";

interface ArtifactCardProps {
  artifact: ArtifactReferenceRecord;
  onOpen: () => void;
}

const getArtifactIcon = (kind: ArtifactReferenceRecord["kind"]) => {
  if (kind === "code" || kind === "html" || kind === "svg" || kind === "mermaid") return FileCode2;
  if (kind === "json" || kind === "yaml" || kind === "sql") return Sparkles;
  return FileText;
};

export function ArtifactCard({ artifact, onOpen }: ArtifactCardProps) {
  const Icon = getArtifactIcon(artifact.kind);
  const isStreaming = artifact.status === "streaming";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "privora-artifact-card group relative mt-3 flex w-full items-center gap-3 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)]/78 px-3 py-3 text-left shadow-sm transition hover:border-[var(--privora-text)]/20 hover:bg-[var(--privora-surface)]",
        isStreaming && "is-streaming border-[var(--privora-accent)]/25"
      )}
    >
      {isStreaming && (
        <span className="privora-artifact-card-shimmer pointer-events-none absolute" />
      )}
      <span className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--privora-user-bubble)] text-[var(--privora-text)]",
        isStreaming && "animate-[privora-artifact-card-pulse_1.6s_ease-in-out_infinite]"
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--privora-text)]">{artifact.title}</span>
        <span className="mt-0.5 block text-xs capitalize text-[var(--privora-muted)]">
          {isStreaming ? `Creating ${artifact.kind} artifact` : `${artifact.kind} artifact`}
        </span>
      </span>
      <Maximize2 className="relative h-4 w-4 text-[var(--privora-muted)] transition group-hover:text-[var(--privora-text)]" />
    </button>
  );
}
