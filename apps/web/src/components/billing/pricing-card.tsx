import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { plans } from "@/lib/plans";

type Plan = (typeof plans)[number];

export function PricingCard({ plan }: { plan: Plan }) {
  return (
    <article className={cn("relative min-h-[470px] bg-background p-7", plan.featured && "bg-[#0e1518]")}>
      {plan.featured ? <div className="absolute right-7 top-7 text-[10px] font-bold uppercase tracking-[.16em] text-primary">Recommended</div> : null}
      <p className="text-[11px] font-bold uppercase tracking-[.18em] text-white/45">{plan.name}</p>
      <div className="mt-12">
        <span className="text-5xl font-semibold tracking-[-0.05em]">{plan.price}</span>
        <span className="ml-2 text-sm text-muted-foreground">{plan.cadence}</span>
      </div>
      <p className="mt-4 min-h-12 text-sm leading-6 text-muted-foreground">{plan.description}</p>
      <div className="my-7 border-y border-white/10 py-4 text-sm font-semibold text-primary">{plan.credits}</div>
        <Link
          to={plan.id === "free" ? "/auth/sign-up" : "/account/billing"}
          className={cn(buttonVariants({ variant: plan.featured ? "default" : "outline" }), "w-full rounded-[4px]")}
        >
          {plan.cta}
        </Link>
        <ul className="mt-7 space-y-3 text-sm text-muted-foreground">
          {plan.features.slice(0, 3).map((feature) => (
            <li key={feature} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
    </article>
  );
}
