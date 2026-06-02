import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";

export const Route = createFileRoute("/legal/acceptable-use")({
  component: AcceptableUsePage,
});

function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      updated="June 2, 2026"
      sections={[
        {
          title: "No abuse",
          body: "Users may not use Privora hosted AI for illegal activity, credential theft, malware deployment, harassment, spam, fraud, or attempts to bypass service limits.",
        },
        {
          title: "Hosted access controls",
          body: "Privora may rate limit, disable hosted access, revoke credits, or suspend accounts when usage threatens service stability, violates policy, or creates billing risk.",
        },
        {
          title: "BYOK usage",
          body: "BYOK usage is still subject to the user's chosen provider policies and applicable law. Privora does not make a provider's prohibited use acceptable.",
        },
      ]}
    />
  );
}
