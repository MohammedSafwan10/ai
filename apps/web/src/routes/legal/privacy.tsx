import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";

export const Route = createFileRoute("/legal/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="June 2, 2026"
      sections={[
        {
          title: "What Privora handles",
          body: "Privora may process account details, subscription state, AI credit balances, hosted model usage metadata, and desktop connection state. BYOK provider keys stay in the desktop app unless a user explicitly configures another storage path.",
        },
        {
          title: "Hosted AI requests",
          body: "When hosted AI credits are used, prompts, tool context, outputs, token counts, model identifiers, and cost metadata may pass through Privora's gateway and selected model providers for the purpose of completing the request and billing credits.",
        },
        {
          title: "Local workspace data",
          body: "Privora Desktop is designed for local workspace use. Public website account pages do not need source code or local files. Hosted gateway requests should send only the context needed for the selected run.",
        },
        {
          title: "Deletion",
          body: "Users should be able to request account deletion, session revocation, and deletion of SaaS billing metadata where legally and operationally permitted.",
        },
      ]}
    />
  );
}
