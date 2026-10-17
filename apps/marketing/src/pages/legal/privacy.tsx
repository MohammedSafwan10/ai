import { LegalPage } from "@/components/legal/legal-page";

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 16, 2026"
      sections={[
        {
          title: "What Privora handles",
          body: "Privora Desktop stores chats, project state, collected evidence and provider configuration locally. API keys use the desktop operating system-backed secret store. Privora accounts, billing and hosted AI credits are not part of this desktop product.",
        },
        {
          title: "Provider requests",
          body: "When you use a remote model provider, prompts and relevant tool context are sent to that configured provider using your credentials. Its privacy policy, retention rules and usage charges apply. Public website hosting, update downloads and embedded demo media also use external services.",
        },
        {
          title: "Local workspace data",
          body: "The static marketing site does not provide account pages or read local project files. Desktop tools can access your selected workspace; Security tools execute in your configured remote environment.",
        },
        {
          title: "Deletion",
          body: "You control local project data and provider keys through the desktop app and its local storage. Files exported outside app storage and data held by configured providers or remote environments must be managed separately.",
        },
      ]}
    />
  );
}
