import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/auth";
import { SectionHeading } from "@/components/marketing/section-heading";

export const Route = createFileRoute("/admin/users")({
  beforeLoad: requireAdmin,
  component: AdminUsersPage,
});

function AdminUsersPage() {
  return <section className="page-shell py-16"><SectionHeading eyebrow="Admin" title="Users" body="Protected user search and account controls will live here." /></section>;
}
