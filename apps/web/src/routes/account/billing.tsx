import { createFileRoute } from "@tanstack/react-router";
import { PricingCard } from "@/components/billing/pricing-card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { plans } from "@/lib/plans";

export const Route = createFileRoute("/account/billing")({
  component: BillingPage,
});

function BillingPage() {
  return (
    <section className="page-shell py-16">
      <SectionHeading eyebrow="Billing" title="Choose a plan after manual credits are stable." body="Razorpay checkout will attach here after the credit engine and desktop account flow are verified." />
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <PricingCard key={plan.id} plan={plan} />
        ))}
      </div>
    </section>
  );
}
