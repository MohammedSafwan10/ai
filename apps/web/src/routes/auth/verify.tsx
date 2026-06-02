import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authSecretSchema } from "@/lib/auth";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth/verify")({
  validateSearch: (search) => authSecretSchema.parse(search),
  component: VerifyPage,
});

function VerifyPage() {
  const { userId, secret } = Route.useSearch();
  const [status, setStatus] = React.useState(userId && secret ? "Verifying email..." : "This verification link is missing required details.");

  React.useEffect(() => {
    if (!userId || !secret) return;
    if (!isAppwriteConfigured) {
      setStatus("Appwrite environment variables are not configured for this site yet.");
      return;
    }
    void account
      .updateVerification({ userId, secret })
      .then(() => setStatus("Email verified. Your Privora account is ready."))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Email verification failed."));
  }, [secret, userId]);

  return (
    <section className="page-shell flex min-h-[calc(100svh-8rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md bg-white/5">
        <CardHeader>
          <CardTitle>Verification</CardTitle>
          <CardDescription>{status}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/account" className={buttonVariants({ variant: "secondary" })}>Open account</Link>
        </CardContent>
      </Card>
    </section>
  );
}
