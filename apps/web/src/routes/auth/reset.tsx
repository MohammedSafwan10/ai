import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authSecretSchema } from "@/lib/auth";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/reset")({
  validateSearch: (search) => authSecretSchema.parse(search),
  component: ResetPage,
});

function ResetPage() {
  const { userId, secret } = Route.useSearch();
  const [password, setPassword] = React.useState("");
  const [status, setStatus] = React.useState(userId && secret ? "Choose a new password." : "This reset link is missing required details.");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isAppwriteConfigured) {
      setStatus("Appwrite environment variables are not configured for this site yet.");
      return;
    }
    if (!userId || !secret) {
      setStatus("This reset link is missing required details.");
      return;
    }
    setStatus("Updating password...");
    try {
      await account.updateRecovery({ userId, secret, password });
      setStatus("Password updated. You can sign in now.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Password reset failed.");
    }
  }

  return (
    <section className="page-shell flex min-h-[calc(100svh-8rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md bg-white/5">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>{status}</CardDescription>
        </CardHeader>
        <CardContent>
          {userId && secret ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <Button className="w-full" type="submit">Update password</Button>
            </form>
          ) : (
            <Link to="/auth/recovery" className={buttonVariants()}>Request a new link</Link>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
