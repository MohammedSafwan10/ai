import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authSecretSchema } from "@/lib/auth";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export const Route = createFileRoute("/auth/reset")({
  validateSearch: (search) => authSecretSchema.parse(search),
  component: ResetPage,
});

function ResetPage() {
  const { userId, secret, redirect } = Route.useSearch();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [updated, setUpdated] = React.useState(false);
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
    if (password.length < 8) {
      setStatus("Use at least 8 characters for the new password.");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }
    setStatus("Updating password...");
    try {
      await account.updateRecovery({ userId, secret, password });
      setUpdated(true);
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
          {updated ? (
            <Link to="/auth/sign-in" search={{ redirect }} className={buttonVariants()}>Sign in</Link>
          ) : userId && secret ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <PasswordInput id="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <PasswordInput id="confirm-password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </div>
              <Button className="w-full" type="submit">Update password</Button>
            </form>
          ) : (
            <Link to="/auth/recovery" search={{ redirect }} className={buttonVariants()}>Request a new link</Link>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
