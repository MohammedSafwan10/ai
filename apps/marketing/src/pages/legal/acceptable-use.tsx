import { LegalPage } from "@/components/legal/legal-page";

export function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      updated="October 16, 2026"
      sections={[
        {
          title: "No abuse",
          body: "Users may not use Privora Desktop for illegal activity, credential theft, malware deployment, harassment, spam, fraud, or attempts to bypass service limits.",
        },
        {
          title: "Provider and remote environment access",
          body: "Use configured providers and remote environments within their applicable terms and your authorized scope. Provider access limits are controlled by your chosen provider; Privora does not operate a hosted account or credit service.",
        },
        {
          title: "BYOK usage",
          body: "BYOK usage is still subject to the user's chosen provider policies and applicable law. Privora does not make a provider's prohibited use acceptable.",
        },
      ]}
    />
  );
}
