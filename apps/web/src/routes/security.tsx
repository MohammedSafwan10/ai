import { createFileRoute } from "@tanstack/react-router";
import { LockKeyhole, Server, ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/security")({
  component: SecurityPage,
});

const items = [
  { icon: LockKeyhole, title: "No hosted key in desktop", body: "The OpenRouter key belongs only in backend environment secrets, never the desktop bundle." },
  { icon: Server, title: "Gateway-enforced credits", body: "Hosted runs are designed to pass through server checks for plan, balance, model allowlist, and caps." },
  { icon: ShieldCheck, title: "Browser account flow", body: "Sign-in and billing happen on the website. Desktop connection will use a short-lived browser callback flow." },
];

function SecurityPage() {
  return (
    <section className="page-shell py-16">
      <SectionHeading
        eyebrow="Security"
        title="Designed so the desktop app does less risky work."
        body="Privora keeps billing, account sessions, and hosted model credentials on the web/backend side. Desktop focuses on local files, local settings, and authenticated API calls."
      />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <Card key={item.title} className="bg-white/5">
            <CardContent className="pt-5">
              <item.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
