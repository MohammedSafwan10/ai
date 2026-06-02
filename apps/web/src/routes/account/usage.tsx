import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/marketing/section-heading";

export const Route = createFileRoute("/account/usage")({
  component: UsagePage,
});

function UsagePage() {
  return (
    <section className="page-shell py-16">
      <SectionHeading eyebrow="Usage" title="AI credit ledger" body="Recent hosted AI usage will appear here from the Appwrite usage_events and credit_ledger collections." />
      <Card className="mt-8 bg-white/5">
        <CardHeader>
          <CardTitle>No usage yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          BYOK runs consume 0 Privora AI credits. Hosted usage will show model family, run id, raw cost, and final credits charged.
        </CardContent>
      </Card>
    </section>
  );
}
