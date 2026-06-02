import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";

export const Route = createFileRoute("/legal/refund")({
  component: RefundPage,
});

function RefundPage() {
  return (
    <LegalPage
      title="Refund Policy"
      updated="June 2, 2026"
      sections={[
        {
          title: "Launch policy",
          body: "Refund handling should be simple during launch. Paid plan refunds may be reviewed case by case, especially if hosted AI credits have already been substantially consumed.",
        },
        {
          title: "Credit consumption",
          body: "Hosted AI credits represent real upstream model cost. Refund decisions can consider unused time, unused credits, payment issues, abuse, and support history.",
        },
        {
          title: "Payment provider",
          body: "Razorpay refund timing and supported payment methods may affect when funds return to the customer.",
        },
      ]}
    />
  );
}
