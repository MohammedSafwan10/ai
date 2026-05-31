const DEFAULT_MAX_BYTES = 220_000;

export class HeadTailOutputBuffer {
  private readonly headBudget: number;
  private readonly tailBudget: number;
  private head: Buffer[] = [];
  private tail: Buffer[] = [];
  private headBytes = 0;
  private tailBytes = 0;
  private omittedBytes = 0;

  constructor(private readonly maxBytes = DEFAULT_MAX_BYTES) {
    this.headBudget = Math.floor(maxBytes / 2);
    this.tailBudget = maxBytes - this.headBudget;
  }

  push(chunk: Buffer | string) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    if (this.maxBytes <= 0) {
      this.omittedBytes += bytes.length;
      return;
    }

    if (this.headBytes < this.headBudget) {
      const remaining = this.headBudget - this.headBytes;
      if (bytes.length <= remaining) {
        this.head.push(bytes);
        this.headBytes += bytes.length;
        return;
      }
      this.head.push(bytes.subarray(0, remaining));
      this.headBytes += remaining;
      this.pushTail(bytes.subarray(remaining));
      return;
    }

    this.pushTail(bytes);
  }

  toString() {
    const head = Buffer.concat(this.head).toString("utf8");
    const tail = Buffer.concat(this.tail).toString("utf8");
    if (this.omittedBytes === 0) return `${head}${tail}`;
    const lineSafe = lineSafeHeadTail(head, tail);
    return `${lineSafe.head}\n\n[... ${this.omittedBytes} bytes omitted from the middle ...]\n\n${lineSafe.tail}`;
  }

  hasContent() {
    return this.headBytes > 0 || this.tailBytes > 0 || this.omittedBytes > 0;
  }

  stats() {
    return {
      retainedBytes: this.headBytes + this.tailBytes,
      omittedBytes: this.omittedBytes,
    };
  }

  private pushTail(bytes: Buffer) {
    if (this.tailBudget <= 0) {
      this.omittedBytes += bytes.length;
      return;
    }

    if (bytes.length >= this.tailBudget) {
      this.omittedBytes += this.tailBytes + bytes.length - this.tailBudget;
      this.tail = [bytes.subarray(bytes.length - this.tailBudget)];
      this.tailBytes = this.tailBudget;
      return;
    }

    this.tail.push(bytes);
    this.tailBytes += bytes.length;
    while (this.tailBytes > this.tailBudget && this.tail.length > 0) {
      const first = this.tail[0];
      const excess = this.tailBytes - this.tailBudget;
      if (excess >= first.length) {
        this.tail.shift();
        this.tailBytes -= first.length;
        this.omittedBytes += first.length;
      } else {
        this.tail[0] = first.subarray(excess);
        this.tailBytes -= excess;
        this.omittedBytes += excess;
      }
    }
  }
}

const lineSafeHeadTail = (head: string, tail: string) => ({
  head: trimPartialTrailingLine(head),
  tail: trimPartialLeadingLine(tail),
});

const trimPartialTrailingLine = (value: string) => {
  if (!value || value.endsWith("\n")) return value;
  const index = value.lastIndexOf("\n");
  return index < 0 ? value : value.slice(0, index + 1);
};

const trimPartialLeadingLine = (value: string) => {
  if (!value || value.startsWith("\n")) return value;
  const index = value.indexOf("\n");
  return index < 0 ? value : value.slice(index + 1);
};

export const compactTextForModel = (text: string | undefined, maxChars = 18_000) => {
  if (!text) return text;
  if (text.length <= maxChars) return text;
  const headLength = Math.floor(maxChars * 0.45);
  const tailLength = maxChars - headLength;
  return [
    text.slice(0, headLength),
    `\n\n[... ${text.length - maxChars} characters omitted from the middle ...]\n\n`,
    text.slice(-tailLength),
  ].join("");
};
