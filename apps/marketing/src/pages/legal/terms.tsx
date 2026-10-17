import { LegalPage } from "@/components/legal/legal-page";

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="October 16, 2026"
      sections={[
        {
          title: "Service",
          body: "Privora provides a desktop agent workspace, updates and configuration for user-selected model providers. It does not provide Privora accounts, paid plans or hosted AI credits.",
        },
        {
          title: "User responsibility",
          body: "Users are responsible for the files, prompts, tools, provider keys, and outputs they choose to use with Privora. Users must comply with applicable laws and provider terms.",
        },
        {
          title: "Provider usage",
          body: "You supply your own provider credentials. Charges, quotas and subscriptions are between you and your chosen provider; Privora does not meter a separate AI credit balance.",
        },
        {
          title: "Changes",
          body: "Features and provider integrations may change. Check release notes and your provider documentation before relying on a specific integration.",
        },
      ]}
    />
  );
}
