import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authRedirectSchema, continueIfAlreadySignedIn, safeRedirect } from "@/lib/auth";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export const Route = createFileRoute("/auth/sign-in")({
  validateSearch: (search) => authRedirectSchema.parse(search),
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [status, setStatus] = React.useState("Sign in to manage credits and connect desktop.");

  React.useEffect(() => {
    let canceled = false;

    const continueSession = async () => {
      if (!isAppwriteConfigured) return;
      setStatus("Checking existing session...");
      const continued = await continueIfAlreadySignedIn(search.redirect);
      if (!continued && !canceled) setStatus("Sign in to manage credits and connect desktop.");
    };

    void continueSession();
    return () => {
      canceled = true;
    };
  }, [search.redirect]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isAppwriteConfigured) {
      setStatus("Appwrite environment variables are not configured for this site yet.");
      return;
    }
    setStatus("Signing in...");
    try {
      await account.createEmailPasswordSession({ email, password });
      setStatus("Signed in. Open Account or connect Privora Desktop.");
      window.location.assign(safeRedirect(search.redirect));
    } catch (error) {
      if (await continueIfAlreadySignedIn(search.redirect)) return;
      setStatus(error instanceof Error ? error.message : "Sign in failed.");
    }
  }

  return (
    <section className="page-shell flex min-h-[calc(100svh-8rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md bg-white/5">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>{status}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/auth/recovery"
                  search={{ email: email || undefined, redirect: search.redirect }}
                  className="text-xs font-medium text-primary hover:text-primary/80"
                >
                  Forgot password?
                </Link>
              </div>
              <PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <Button className="w-full" type="submit">Sign in</Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            New here? <Link to="/auth/sign-up" className="text-primary">Create an account</Link>
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
