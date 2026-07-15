import { createFileRoute } from "@tanstack/react-router";
import { Check, KeyRound, Sparkles } from "lucide-react";
import { PricingCard } from "@/components/billing/pricing-card";
import { AI_CREDIT_POLICY, plans } from "@/lib/plans";

export const Route = createFileRoute("/pricing")({ component: PricingPage });

function PricingPage() {
  return (
    <>
      <section className="hero-grid border-b border-white/[0.07]">
        <div className="page-shell py-20 text-center md:py-28">
          <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> Simple pricing</div>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-[-0.06em] md:text-7xl">Start with your keys.<br />Scale when you need to.</h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground">Every plan includes Privora’s local workspace. Pay only when you want hosted models and credits.</p>
        </div>
      </section>
      <section className="page-shell py-16 md:py-24">
        <div className="grid gap-px border border-white/[0.1] bg-white/[0.1] lg:grid-cols-3">
          {plans.map((plan) => <PricingCard key={plan.id} plan={plan} />)}
        </div>
        <div className="mt-8 flex flex-col gap-5 border-y border-white/10 py-6 text-sm text-muted-foreground md:flex-row md:items-center">
          <span className="flex items-center gap-2 text-foreground"><KeyRound className="h-4 w-4 text-primary" /> BYOK uses zero Privora credits.</span>
          <span className="hidden h-4 w-px bg-white/10 md:block" />
          <span>{AI_CREDIT_POLICY}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2"><Check className="h-4 w-4 text-primary" /> No surprise overages</span>
        </div>
      </section>
    </>
  );
}
