import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/auth";
import { SectionHeading } from "@/components/marketing/section-heading";

export const Route = createFileRoute("/admin/usage")({
  beforeLoad: requireAdmin,
  component: AdminUsagePage,
});

function AdminUsagePage() {
  return <section className="page-shell py-16"><SectionHeading eyebrow="Admin" title="Usage" body="Hosted AI usage, ledger, and abuse review will live here." /></section>;
}
