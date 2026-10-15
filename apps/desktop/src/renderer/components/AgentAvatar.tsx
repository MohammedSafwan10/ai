import { agentIdentity } from "../features/chat/agentIdentity";
import "./agentAvatar.css";

/** Decorative identity, independent of task status or permissions. */
export function AgentAvatar({ id, small = false }: { id: string; small?: boolean }) {
  const { shape, tint } = agentIdentity(id);
  return <span className={`agent-avatar agent-tint-${tint}${small ? " small" : ""}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    {shape === 0 && <>{[0, 90, 180, 270].map((angle) => <path key={angle} transform={`rotate(${angle} 12 12)`} d="M12 2.5 15 7 12 10 9 7Z" fill="currentColor" fillOpacity=".3" />)}<circle cx="12" cy="12" r="1.5" fill="currentColor" /></>}
    {shape === 1 && <>{[0, 60, 120, 180, 240, 300].map((angle) => <rect key={angle} transform={`rotate(${angle} 12 12)`} x="10" y="2.5" width="4" height="6" rx="2" fill="currentColor" fillOpacity=".35" />)}<circle cx="12" cy="12" r="2" /></>}
    {shape === 2 && <><path d="M8 3v18M16 3v18M3 8h18M3 16h18" />{[[8, 8], [16, 8], [8, 16], [16, 16]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill="currentColor" stroke="none" />)}</>}
    {shape === 3 && <><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(45 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-45 12 12)" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /></>}
    {shape === 4 && <><path d="m12 2 9 10-9 10L3 12Z" fill="currentColor" fillOpacity=".18" /><path d="m12 6 5.5 6-5.5 6-5.5-6Z" fill="currentColor" fillOpacity=".4" /><path d="M3 12h18M12 2v20" /></>}
    {shape === 5 && <>{[0, 120, 240].map((angle) => <path key={angle} transform={`rotate(${angle} 12 12)`} d="M12 12C4 11 4 2 9 3c4 0 5 5 3 9Z" fill="currentColor" fillOpacity=".45" />)}<circle cx="12" cy="12" r="2" fill="currentColor" /></>}
    {shape === 6 && <><path d="m12 2 8.7 5v10L12 22l-8.7-5V7Z" fill="currentColor" fillOpacity=".14" /><path d="m12 7 4.3 2.5v5L12 17l-4.3-2.5v-5Z" fill="currentColor" fillOpacity=".4" /><path d="M12 2v5m8.7 10-4.4-2.5M3.3 17l4.4-2.5" /></>}
    {shape === 7 && <>{[0, 90, 180, 270].map((angle) => <path key={angle} transform={`rotate(${angle} 12 12)`} d="m12 2 3 6-3 2-3-2Z" fill="currentColor" fillOpacity=".35" />)}<path d="m12 9 3 3-3 3-3-3Z" fill="currentColor" /></>}
    {shape === 8 && <><path d="M5 5h6v6H5Zm8 8h6v6h-6Z" fill="currentColor" fillOpacity=".35" /><path d="M13 5h6v6h-6ZM5 13h6v6H5Z" /><path d="m9 3 3 3 3-3m-6 18 3-3 3 3" /></>}
    {shape === 9 && <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v5M20.5 12h-5M12 20.5v-5M3.5 12h5" /><circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity=".4" /></>}
    {shape === 10 && <>{[0, 120, 240].map((angle) => <path key={angle} transform={`rotate(${angle} 12 12)`} d="M12 3c5 0 8 4 8 8h-5c0-2-1-3-3-3Z" fill="currentColor" fillOpacity=".35" />)}<circle cx="12" cy="12" r="1.5" fill="currentColor" /></>}
    {shape === 11 && <><path d="M7 4h10l5 8-5 8H7l-5-8Z" fill="currentColor" fillOpacity=".12" /><path d="m7 4 5 8 5-8M2 12h20M7 20l5-8 5 8" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /></>}
    {shape === 12 && <><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" /><path d="m9 5 3 3 3-3M9 19l3-3 3 3M5 9l3 3-3 3m14-6-3 3 3 3" /><circle cx="12" cy="12" r="2" fill="currentColor" /></>}
    {shape === 13 && <><path d="m12 3 9 16H3Z" fill="currentColor" fillOpacity=".15" /><path d="m12 8 6 11M6 19l6-11m-3 6h6" /><circle cx="12" cy="4" r="1.5" fill="currentColor" /></>}
    {shape === 14 && <><rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" fillOpacity=".1" /><path d="M7 8h10v8H7Z" /><path d="M9 3v5m6-5v5M9 16v5m6-5v5M3 10h4m-4 4h4m10-4h4m-4 4h4" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></>}
    {shape === 15 && <>{[0, 72, 144, 216, 288].map((angle) => <ellipse key={angle} transform={`rotate(${angle} 12 12)`} cx="12" cy="7" rx="3" ry="4.5" fill="currentColor" fillOpacity=".2" />)}<circle cx="12" cy="12" r="2" fill="currentColor" /></>}
    {shape === 16 && <><path d="m12 2 9 5-9 5-9-5Z" fill="currentColor" fillOpacity=".4" /><path d="m3 11 9 5 9-5M3 15l9 5 9-5" /><path d="M12 12v8" /></>}
    {shape === 17 && <><path d="M4 6h5l3 6-3 6H4l3-6Zm16 0h-5l-3 6 3 6h5l-3-6Z" fill="currentColor" fillOpacity=".3" /><circle cx="12" cy="12" r="2" fill="currentColor" /></>}
    {shape === 18 && <><path d="M5 3h14L5 21h14Z" fill="currentColor" fillOpacity=".15" /><path d="M8 7h8M8 17h8M9 10l6 4m-6 0 6-4" /><circle cx="5" cy="3" r="1.5" fill="currentColor" /><circle cx="19" cy="21" r="1.5" fill="currentColor" /></>}
    {shape === 19 && <><path d="M3 16c3-12 6 12 9 0S18 4 21 8M3 8c3 12 6-12 9 0s6 12 9 8" /><circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity=".6" /></>}
    {shape === 20 && <><path d="M12 2 3 7v10l9 5 9-5V7Z" fill="currentColor" fillOpacity=".12" /><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5v5l-9 5v-10l9-5" /></>}
    {shape === 21 && <><path d="M4 5h7v7H4Zm9 7h7v7h-7Z" fill="currentColor" fillOpacity=".3" /><path d="M14 4h6v6M4 14v6h6M14 4l6 6M4 14l6 6" /><path d="m9 9 6 6" /></>}
    {shape === 22 && <>{[0, 90, 180, 270].map((angle) => <ellipse key={angle} transform={`rotate(${angle} 12 12)`} cx="12" cy="7.5" rx="3" ry="5" fill="currentColor" fillOpacity=".12" />)}<circle cx="12" cy="12" r="1.5" fill="currentColor" /></>}
    {shape === 23 && <><rect x="5" y="5" width="14" height="14" rx="3" transform="rotate(45 12 12)" fill="currentColor" fillOpacity=".1" /><rect x="8" y="8" width="8" height="8" rx="1.5" transform="rotate(45 12 12)" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>}
    {shape === 24 && <>{[0, 120, 240].map((angle) => <path key={angle} transform={`rotate(${angle} 12 12)`} d="M12 3c-5 0-8 5-5 8 2 2 5 1 5-2Z" fill="currentColor" fillOpacity=".18" />)}<circle cx="12" cy="12" r="2" /></>}
    {shape === 25 && <><path d="M6 4h12l4 8-4 8H6l-4-8Z" /><path d="m6 4 6 8 6-8M6 20l6-8 6 8M2 12h20" strokeOpacity=".65" /><circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity=".35" /></>}
    {shape === 26 && <>{[0, 90, 180, 270].map((angle) => <path key={angle} transform={`rotate(${angle} 12 12)`} d="m12 3 4 5-4 2-4-2Z" fill="currentColor" fillOpacity=".15" />)}<circle cx="12" cy="12" r="2" /></>}
    {shape === 27 && <><path d="M5 5h14v14H5Z" transform="rotate(15 12 12)" fill="currentColor" fillOpacity=".08" /><path d="M5 5h14v14H5Z" transform="rotate(-15 12 12)" fill="currentColor" fillOpacity=".08" /><circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity=".3" /></>}
    {shape === 28 && <>{[0, 120, 240].map((angle) => <ellipse key={angle} transform={`rotate(${angle} 12 12)`} cx="12" cy="12" rx="9" ry="3.5" strokeOpacity=".85" />)}<circle cx="12" cy="12" r="1.8" fill="currentColor" /></>}
    {shape === 29 && <><path d="M7 3h10l5 9-5 9H7l-5-9Z" /><path d="m7 3 5 5 5-5m5 9-7 1 2 8M7 21l2-8-7-1" /><path d="m12 8 3 5H9Z" fill="currentColor" fillOpacity=".25" /></>}
    {shape === 30 && <>{[0, 90, 180, 270].map((angle) => <path key={angle} transform={`rotate(${angle} 12 12)`} d="M12 3h5v5h-5Z" fill="currentColor" fillOpacity=".2" />)}<path d="m12 8 4 4-4 4-4-4Z" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>}
    {shape === 31 && <><circle cx="12" cy="12" r="8.5" strokeDasharray="9 4.35" />{[0, 120, 240].map((angle) => <path key={angle} transform={`rotate(${angle} 12 12)`} d="m12 5 3.5 6-3.5-1-3.5 1Z" fill="currentColor" fillOpacity=".18" />)}<circle cx="12" cy="12" r="1.5" fill="currentColor" /></>}
  </svg></span>;
}
