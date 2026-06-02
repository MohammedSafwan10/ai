import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { plans } from "@/lib/plans";

type Plan = (typeof plans)[number];

export function PricingCard({ plan }: { plan: Plan }) {
  return (
    <Card className={cn("relative overflow-hidden", plan.featured && "border-primary/45 bg-primary/8")}>
      {plan.featured ? <div className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">Best start</div> : null}
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <span className="text-4xl font-semibold">{plan.price}</span>
          <span className="ml-2 text-sm text-muted-foreground">{plan.cadence}</span>
        </div>
        <div className="mb-5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold">{plan.credits}</div>
        <Link
          to={plan.id === "free" ? "/auth/sign-up" : "/account/billing"}
          className={cn(buttonVariants({ variant: plan.featured ? "default" : "secondary" }), "w-full")}
        >
          {plan.cta}
        </Link>
        <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
          {plan.features.map((feature) => (
            <li key={feature} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
