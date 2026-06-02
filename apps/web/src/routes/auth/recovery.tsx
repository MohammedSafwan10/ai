import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authRecoverySchema } from "@/lib/auth";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/recovery")({
  validateSearch: (search) => authRecoverySchema.parse(search),
  component: RecoveryPage,
});

function RecoveryPage() {
  const search = Route.useSearch();
  const [email, setEmail] = React.useState(search.email || "");
  const [sent, setSent] = React.useState(false);
  const [status, setStatus] = React.useState("Enter your account email and we will send a reset link.");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isAppwriteConfigured) {
      setStatus("Appwrite environment variables are not configured for this site yet.");
      return;
    }
    setStatus("Sending recovery email...");
    try {
      const resetUrl = new URL("/auth/reset", window.location.origin);
      if (search.redirect) resetUrl.searchParams.set("redirect", search.redirect);
      await account.createRecovery({ email, url: resetUrl.toString() });
      setSent(true);
      setStatus("If that email has a Privora account, a reset link has been sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Recovery failed.");
    }
  }

  return (
    <section className="page-shell flex min-h-[calc(100svh-8rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md bg-white/5">
        <CardHeader>
          <CardTitle>Recover account</CardTitle>
          <CardDescription>{status}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <Button className="w-full" type="submit">{sent ? "Send again" : "Send reset link"}</Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Link to="/auth/sign-in" search={{ redirect: search.redirect }} className={buttonVariants({ variant: "ghost", size: "sm" })}>Back to sign in</Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
