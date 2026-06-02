import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearCurrentSessionIfAny, isUnauthenticatedAppwriteError } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/account/")({
  component: AccountPage,
});

function AccountPage() {
  const [user, setUser] = React.useState<{ name?: string; email?: string } | null>(null);
  const [status, setStatus] = React.useState("Checking account...");

  async function refresh() {
    if (!isAppwriteConfigured) {
      setUser(null);
      setStatus("Appwrite environment variables are not configured for this site yet.");
      return;
    }
    setStatus("Refreshing...");
    try {
      const current = await account.get();
      setUser({ name: current.name, email: current.email });
      setStatus("Account connected.");
    } catch (error) {
      if (isUnauthenticatedAppwriteError(error)) await clearCurrentSessionIfAny();
      setUser(null);
      setStatus("Not signed in.");
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  async function signOut() {
    setStatus("Signing out...");
    try {
      await account.deleteSession({ sessionId: "current" });
    } catch {
      // The session may already be gone; signed-out UI is still the right final state.
    }
    setUser(null);
    setStatus("Signed out.");
  }

  return (
    <section className="page-shell py-16">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Account</p>
          <h1 className="mt-3 text-4xl font-semibold">Credits, plan, and desktop connection</h1>
          <p className="mt-3 text-muted-foreground">{status}</p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="bg-white/5">
          <CardHeader>
            <CardTitle>{user?.name || "Privora account"}</CardTitle>
            <CardDescription>{user?.email || "Sign in to connect desktop and view SaaS billing."}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {user ? (
              <Button
                variant="outline"
                onClick={() => void signOut()}
              >
                Sign out
              </Button>
            ) : (
              <Link to="/auth/sign-in" className={buttonVariants()}>Sign in</Link>
            )}
            <Link to="/desktop/connect" className={cn(buttonVariants({ variant: "secondary" }))}>Connect desktop</Link>
          </CardContent>
        </Card>
        <Card className="bg-white/5">
          <CardHeader>
            <CardTitle>Billing snapshot</CardTitle>
            <CardDescription>Live subscription and credit documents will render here after the Appwrite account data read path is connected.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Plan", "Free BYOK"],
                ["AI credits", "BYOK only"],
                ["Renewal", "Not scheduled"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase text-muted-foreground">{label}</p>
                  <p className="mt-2 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
