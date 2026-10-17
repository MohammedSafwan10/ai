import { Search } from "lucide-react";
import { useState } from "react";

export function ShortcutSettings() {
  const [query, setQuery] = useState("");
  const mod = /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl";
  const sections = [
    { title: "Chat", rows: [
      { keys: ["Enter"], label: "Send or queue a follow-up" },
      { keys: ["Shift", "Enter"], label: "Add a new line" },
      { keys: ["↑", "↓"], label: "Browse prompt history", note: "When the composer is empty or browsing history" },
      { keys: ["@"], label: "Find files and context", note: "Type @ followed by a name" },
      { keys: ["Tab"], label: "Insert the first context suggestion", note: "While context suggestions are open" },
    ] },
    { title: "Model picker", rows: [
      { keys: ["↑", "↓"], label: "Navigate search results" },
      { keys: ["Enter"], label: "Select the highlighted model" },
      { keys: ["←", "→"], label: "Switch Chat and Subagents", note: "While a tab is focused" },
      { keys: ["Esc"], label: "Close the model picker" },
    ] },
    { title: "App and view", rows: [
      { keys: [mod, "/"], label: "Open keyboard shortcuts" },
      { keys: [mod, "+"], label: "Zoom in" },
      { keys: [mod, "−"], label: "Zoom out" },
      { keys: [mod, "0"], label: "Reset zoom" },
      { keys: ["Esc"], label: "Close settings or an image preview" },
      { keys: ["←", "→"], label: "Browse attached images", note: "While an image preview is open" },
    ] },
    { title: "Saved prompts", rows: [
      { keys: ["Alt", "↑"], label: "Move a pinned prompt up", note: "While its row is focused" },
      { keys: ["Alt", "↓"], label: "Move a pinned prompt down", note: "While its row is focused" },
    ] },
  ];
  const filtered = sections.map((section) => ({ ...section, rows: section.rows.filter((row) =>
    `${section.title} ${row.label} ${row.keys.join(" ")} ${row.note ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) })).filter((section) => section.rows.length);
  return <div className="settings-section settings-shortcuts">
    <p className="settings-description">Shortcuts follow the area you’re working in.</p>
    <div className="settings-search"><Search size={15} aria-hidden="true" /><input aria-label="Search shortcuts" placeholder="Search shortcuts…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    {filtered.map((section) => <section className="settings-detail-group" key={section.title} aria-label={section.title}>
      <h3>{section.title}</h3>{section.rows.map((row) => <div className="settings-shortcut-row" key={row.label}>
        <div><span>{row.label}</span>{row.note && <small>{row.note}</small>}</div>
        <span className="settings-keycaps">{row.keys.map((key, index) => <kbd key={index}>{key}</kbd>)}</span>
      </div>)}
    </section>)}
    {!filtered.length && <p className="settings-description" role="status">No matching shortcuts.</p>}
  </div>;
}
