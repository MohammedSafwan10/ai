import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/marketing/section-heading";

export const Route = createFileRoute("/admin/")({
  beforeLoad: requireAdmin,
  component: AdminPage,
});

function AdminPage() {
  return (
    <section className="page-shell py-16">
      <SectionHeading eyebrow="Admin" title="Web-only SaaS operations" body="Admin controls belong in a protected web surface, not inside Privora Desktop." />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {["Grant credits", "Change plan", "Disable hosted access"].map((item) => (
          <Card key={item} className="bg-white/5">
            <CardHeader>
              <CardTitle>{item}</CardTitle>
              <CardDescription>Role-gated implementation comes after desktop browser auth.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Uses Appwrite role checks and server-side functions only.</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
