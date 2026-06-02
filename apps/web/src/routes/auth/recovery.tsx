import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/recovery")({
  component: RecoveryPage,
});

function RecoveryPage() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState("Send a password recovery link.");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isAppwriteConfigured) {
      setStatus("Appwrite environment variables are not configured for this site yet.");
      return;
    }
    setStatus("Sending recovery email...");
    try {
      await account.createRecovery({ email, url: `${window.location.origin}/auth/reset` });
      setStatus("Recovery email sent.");
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
              <Input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <Button className="w-full" type="submit">Send recovery link</Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
