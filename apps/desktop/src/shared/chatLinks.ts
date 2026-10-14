/** Repair only a missing-dot hostname when the visible URL supplies the dots. */
export const resolveChatWebLink = (href: string | undefined, label: string): string | null => {
  if (!href) return null;
  try {
    const target = new URL(href);
    if (target.protocol !== "https:" && target.protocol !== "http:") return null;
    if (!target.hostname.includes(".") && target.hostname !== "localhost" && !target.username && !target.password) {
      try {
        const visible = new URL(/^https?:\/\//i.test(label.trim()) ? label.trim() : `https://${label.trim()}`);
        if (!/\s/.test(label) && !visible.username && !visible.password && visible.hostname.includes(".") &&
          visible.hostname.replace(/\./g, "") === target.hostname) {
          target.hostname = visible.hostname;
          return target.href;
        }
      } catch { /* A prose label provides no reliable domain correction. */ }
    }
    return href;
  } catch {
    return null;
  }
};
