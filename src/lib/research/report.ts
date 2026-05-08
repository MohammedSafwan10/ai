import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { ResearchPlanRecord, ResearchSourceRecord } from "../db";

export interface ResearchReportData {
  title: string;
  content: string;
  sources?: ResearchSourceRecord[];
  plan?: ResearchPlanRecord;
  startedAt?: number;
  completedAt?: number;
  timeBudgetMs?: number;
}

export interface ResearchReportMeta {
  title: string;
  filename: string;
  elapsedLabel?: string;
  sourceCount: number;
  citationCount: number;
  toc: Array<{ id: string; level: number; text: string }>;
}

const SOURCE_SECTION_PATTERN = /(?:^|\n)#{1,3}\s*Sources\s*\n[\s\S]*$/i;

export const hasMarkdownSourceSection = (markdown: string) => SOURCE_SECTION_PATTERN.test(markdown);

export const formatResearchElapsed = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`;
};

const stripMarkdown = (value: string) =>
  value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const slugifyHeading = (text: string, used = new Map<string, number>()) => {
  const base = stripMarkdown(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
  const count = used.get(base) || 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
};

export const extractHeadings = (markdown: string) => {
  const used = new Map<string, number>();
  return Array.from(markdown.matchAll(/^(#{1,3})\s+(.+)$/gm)).map(match => {
    const text = stripMarkdown(match[2]);
    return {
      id: slugifyHeading(text, used),
      level: match[1].length,
      text,
    };
  });
};

export const getResearchReportMeta = ({
  title,
  content,
  sources,
  plan,
  startedAt,
  completedAt,
}: ResearchReportData): ResearchReportMeta => {
  const firstHeading = content.match(/^#\s+(.+)$/m)?.[1];
  const resolvedTitle = stripMarkdown(plan?.title || firstHeading || title || "Deep Research Report");
  const elapsedLabel = startedAt && completedAt ? formatResearchElapsed(completedAt - startedAt) : undefined;
  const citationCount = new Set(Array.from(content.matchAll(/\[(\d+)\]/g), match => match[1])).size;

  return {
    title: resolvedTitle,
    filename: sanitizeFilename(resolvedTitle),
    elapsedLabel,
    sourceCount: sources?.length || 0,
    citationCount,
    toc: extractHeadings(content),
  };
};

export const sanitizeFilename = (title: string) =>
  (title || "research-report")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90)
    .toLowerCase() || "research-report";

export const buildReportMarkdown = (data: ResearchReportData) => {
  const meta = getResearchReportMeta(data);
  const hasSourcesInContent = hasMarkdownSourceSection(data.content);
  const cleanContent = hasSourcesInContent ? data.content.trim() : data.content.replace(SOURCE_SECTION_PATTERN, "").trim();
  const lines = [cleanContent];
  const summary: string[] = [];

  if (meta.elapsedLabel) summary.push(`Completed in ${meta.elapsedLabel}`);
  if (meta.sourceCount > 0) summary.push(`${meta.sourceCount} source${meta.sourceCount === 1 ? "" : "s"}`);
  if (meta.citationCount > 0) summary.push(`${meta.citationCount} citation${meta.citationCount === 1 ? "" : "s"}`);
  if (summary.length > 0) lines.push(`\n---\n\n${summary.join(" · ")}`);

  if (!hasSourcesInContent && data.sources && data.sources.length > 0) {
    lines.push("\n## Sources");
    data.sources.forEach((source, index) => {
      lines.push(`${index + 1}. ${source.title ? `${source.title} - ` : ""}${source.url}`);
    });
  }

  return lines.join("\n").trim() + "\n";
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const copyReportContents = async (data: ResearchReportData) => {
  const markdown = buildReportMarkdown(data);
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(markdown);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = markdown;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

export const exportReportMarkdown = (data: ResearchReportData) => {
  const meta = getResearchReportMeta(data);
  const blob = new Blob([buildReportMarkdown(data)], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `${meta.filename}.md`);
};

const splitMarkdownRows = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map(cell => stripMarkdown(cell.trim()));

const DOCX_COLORS = {
  text: "292524",
  muted: "78716C",
  border: "DED8CD",
  headerFill: "F1ECE4",
  softFill: "FAF8F4",
};

const softBorder = { style: BorderStyle.SINGLE, size: 1, color: DOCX_COLORS.border };

const paragraphFromText = (
  text: string,
  options: {
    heading?: keyof typeof HeadingLevel;
    bullet?: boolean;
    compact?: boolean;
    color?: string;
    bold?: boolean;
  } = {}
) => {
  const children: Array<TextRun | ExternalHyperlink> = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const isHeading = Boolean(options.heading);
  const fontSize = options.heading === "HEADING_1" ? 36 : options.heading === "HEADING_2" ? 28 : options.heading === "HEADING_3" ? 24 : options.compact ? 18 : 22;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      children.push(new TextRun({
        text: stripMarkdown(text.slice(lastIndex, match.index)),
        size: fontSize,
        color: options.color || DOCX_COLORS.text,
        bold: isHeading || options.bold,
      }));
    }
    children.push(
      new ExternalHyperlink({
        link: match[2],
        children: [new TextRun({ text: match[1], style: "Hyperlink", size: fontSize })],
      })
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    children.push(new TextRun({
      text: stripMarkdown(text.slice(lastIndex)),
      size: fontSize,
      color: options.color || DOCX_COLORS.text,
      bold: isHeading || options.bold,
    }));
  }
  if (children.length === 0) {
    children.push(new TextRun({
      text: stripMarkdown(text),
      size: fontSize,
      color: options.color || DOCX_COLORS.text,
      bold: isHeading || options.bold,
    }));
  }

  return new Paragraph({
    heading: options.heading ? HeadingLevel[options.heading] : undefined,
    bullet: options.bullet ? { level: 0 } : undefined,
    keepNext: isHeading,
    spacing: {
      before: options.heading === "HEADING_1" ? 360 : options.heading === "HEADING_2" ? 280 : options.heading === "HEADING_3" ? 180 : 0,
      after: isHeading ? 180 : options.compact ? 70 : 180,
      line: options.compact ? 250 : 320,
    },
    indent: options.bullet ? { left: 360, hanging: 180 } : undefined,
    children,
  });
};

const docxCell = (text: string, options: { header?: boolean; width?: number; muted?: boolean } = {}) =>
  new TableCell({
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    shading: options.header ? { type: ShadingType.CLEAR, fill: DOCX_COLORS.headerFill } : undefined,
    margins: { top: 120, bottom: 120, left: 120, right: 120 },
    verticalAlign: VerticalAlign.TOP,
    borders: { top: softBorder, bottom: softBorder, left: softBorder, right: softBorder },
    children: [
      paragraphFromText(text || "-", {
        compact: true,
        bold: options.header,
        color: options.muted ? DOCX_COLORS.muted : DOCX_COLORS.text,
      }),
    ],
  });

const docxSummaryParagraph = (text: string) =>
  new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: DOCX_COLORS.softFill },
    border: { top: softBorder, bottom: softBorder, left: softBorder, right: softBorder },
    spacing: { before: 120, after: 260, line: 300 },
    children: [new TextRun({ text, size: 20, color: DOCX_COLORS.muted })],
  });

const markdownToDocxChildren = (markdown: string) => {
  const lines = markdown.split("\n");
  const children: Array<Paragraph | Table> = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    const text = paragraphBuffer.join(" ").trim();
    if (text) children.push(paragraphFromText(text));
    paragraphBuffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (/^\|.+\|$/.test(trimmed) && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[index + 1]?.trim() || "")) {
      flushParagraph();
      const header = splitMarkdownRows(trimmed);
      index += 2;
      const columnCount = Math.max(header.length, 1);
      const columnWidths = columnCount === 4 ? [16, 32, 32, 20] : Array.from({ length: columnCount }, () => 100 / columnCount);
      const rows = [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: header.map((cell, cellIndex) => docxCell(cell, { header: true, width: columnWidths[cellIndex] })),
        }),
      ];

      while (index < lines.length && /^\|.+\|$/.test(lines[index].trim())) {
        rows.push(new TableRow({
          cantSplit: true,
          children: splitMarkdownRows(lines[index]).map((cell, cellIndex) => docxCell(cell, { width: columnWidths[cellIndex] })),
        }));
        index += 1;
      }
      index -= 1;
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          alignment: AlignmentType.CENTER,
          margins: { top: 120, bottom: 120, left: 120, right: 120 },
          borders: {
            top: softBorder,
            bottom: softBorder,
            left: softBorder,
            right: softBorder,
            insideHorizontal: softBorder,
            insideVertical: softBorder,
          },
          rows,
        })
      );
      children.push(new Paragraph({ spacing: { after: 260 }, children: [] }));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const heading = headingMatch[1].length === 1 ? "HEADING_1" : headingMatch[1].length === 2 ? "HEADING_2" : "HEADING_3";
      children.push(paragraphFromText(headingMatch[2], { heading: heading as keyof typeof HeadingLevel }));
      continue;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      children.push(paragraphFromText(listMatch[1], { bullet: true }));
      continue;
    }

    if (trimmed === "---") {
      flushParagraph();
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  return children;
};

const normalizeReportText = (value: string) =>
  stripMarkdown(value)
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

export const exportReportWord = async (data: ResearchReportData) => {
  const meta = getResearchReportMeta(data);
  const summary = [
    meta.elapsedLabel ? `Completed in ${meta.elapsedLabel}` : "Research completed",
    `${meta.citationCount} citation${meta.citationCount === 1 ? "" : "s"}`,
    `${meta.sourceCount} source${meta.sourceCount === 1 ? "" : "s"}`,
  ].join("  |  ");
  const markdown = buildReportMarkdown(data);
  const markdownChildren = markdownToDocxChildren(markdown);
  const hasDuplicateTitle = normalizeReportText(markdown.match(/^#\s+(.+)$/m)?.[1] || "").toLowerCase() === meta.title.toLowerCase();
  const children = [
    paragraphFromText(meta.title, { heading: "HEADING_1" }),
    docxSummaryParagraph(summary),
    ...(hasDuplicateTitle ? markdownChildren.slice(1) : markdownChildren),
  ];
  const document = new Document({
    title: meta.title,
    creator: "Privora",
    description: "Deep Research export",
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: {
              top: convertInchesToTwip(0.65),
              right: convertInchesToTwip(0.65),
              bottom: convertInchesToTwip(0.65),
              left: convertInchesToTwip(0.65),
            },
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  downloadBlob(blob, `${meta.filename}.docx`);
};
