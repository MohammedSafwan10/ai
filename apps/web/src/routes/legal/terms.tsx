import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";

export const Route = createFileRoute("/legal/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="June 2, 2026"
      sections={[
        {
          title: "Service",
          body: "Privora provides a desktop agent workspace, account services, updates, BYOK configuration support, and optional hosted AI credits. Hosted access is metered and not unlimited.",
        },
        {
          title: "User responsibility",
          body: "Users are responsible for the files, prompts, tools, provider keys, and outputs they choose to use with Privora. Users must comply with applicable laws and provider terms.",
        },
        {
          title: "Plans and credits",
          body: "Free accounts use BYOK only. Paid plans include monthly AI credits. AI credits can be consumed faster by larger inputs, larger outputs, tool usage, or premium models.",
        },
        {
          title: "Changes",
          body: "Privora may update plans, features, credit policies, and provider availability. Material billing changes should be communicated before they affect active paid subscriptions.",
        },
      ]}
    />
  );
}
