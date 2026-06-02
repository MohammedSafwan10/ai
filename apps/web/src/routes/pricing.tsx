import { createFileRoute } from "@tanstack/react-router";
import { PricingCard } from "@/components/billing/pricing-card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { AI_CREDIT_POLICY, creditFacts, plans } from "@/lib/plans";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  return (
    <section className="page-shell py-16">
      <SectionHeading
        eyebrow="Pricing"
        title="Start free. Pay when Privora hosts the AI."
        body="Every plan supports BYOK. Paid plans add monthly AI credits for Privora-hosted models through the secure gateway."
      />
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <PricingCard key={plan.id} plan={plan} />
        ))}
      </div>
      <Card className="mt-6 bg-white/5">
        <CardContent className="grid gap-6 pt-5 lg:grid-cols-[1.2fr_0.8fr]">
          <p className="text-sm leading-6 text-muted-foreground">{AI_CREDIT_POLICY}</p>
          <ul className="space-y-2 text-sm">
            {creditFacts.map((fact) => (
              <li key={fact} className="rounded-md bg-white/5 px-3 py-2">{fact}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
