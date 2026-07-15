import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  body?: string;
  className?: string;
}

export function SectionHeading({ eyebrow, title, body, className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl", className)}>
      {eyebrow ? <p className="section-kicker mb-4">{eyebrow}</p> : null}
      <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.04em] text-foreground md:text-5xl">{title}</h2>
      {body ? <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">{body}</p> : null}
    </div>
  );
}
