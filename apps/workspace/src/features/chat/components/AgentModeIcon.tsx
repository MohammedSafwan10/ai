import type { SVGProps } from "react";

export function AgentModeIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M12 7.2 15.2 10.4 12 13.6 8.8 10.4 12 7.2Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 10.4H6.7V7.9M15.2 10.4h2.1V7.9M12 13.6v2.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m4 16.8 2.1-2.1M17.9 14.7l2.1 2.1"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 19.2h3.6"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <rect x="3.6" y="3.8" width="4.4" height="4.4" rx="1.15" stroke="currentColor" strokeWidth="1.65" />
      <rect x="16" y="3.8" width="4.4" height="4.4" rx="1.15" stroke="currentColor" strokeWidth="1.65" />
      <rect x="9.8" y="15.8" width="4.4" height="4.4" rx="1.15" stroke="currentColor" strokeWidth="1.65" />
      <path d="M11.2 10.4h1.6" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}
