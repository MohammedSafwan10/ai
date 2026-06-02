import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  body?: string;
  className?: string;
}

export function SectionHeading({ eyebrow, title, body, className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow ? <p className="mb-3 text-sm font-semibold uppercase text-primary">{eyebrow}</p> : null}
      <h2 className="text-3xl font-semibold leading-tight text-foreground md:text-4xl">{title}</h2>
      {body ? <p className="mt-4 text-base leading-7 text-muted-foreground">{body}</p> : null}
    </div>
  );
}
