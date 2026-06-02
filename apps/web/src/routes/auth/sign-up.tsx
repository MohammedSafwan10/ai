import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authRedirectSchema, continueIfAlreadySignedIn, safeRedirect } from "@/lib/auth";
import { account, ID, isAppwriteConfigured } from "@/lib/appwrite";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export const Route = createFileRoute("/auth/sign-up")({
  validateSearch: (search) => authRedirectSchema.parse(search),
  component: SignUpPage,
});

function SignUpPage() {
  const search = Route.useSearch();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [status, setStatus] = React.useState("Create a free account. BYOK works on every plan.");

  React.useEffect(() => {
    let canceled = false;

    const continueSession = async () => {
      if (!isAppwriteConfigured) return;
      setStatus("Checking existing session...");
      const continued = await continueIfAlreadySignedIn(search.redirect);
      if (!continued && !canceled) setStatus("Create a free account. BYOK works on every plan.");
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
    setStatus("Creating account...");
    try {
      await account.create({ userId: ID.unique(), email, password, name });
      await account.createEmailPasswordSession({ email, password });
      await account.createVerification({ url: `${window.location.origin}/auth/verify` });
      setStatus("Account created. Verification email sent.");
      window.location.assign(safeRedirect(search.redirect));
    } catch (error) {
      if (await continueIfAlreadySignedIn(search.redirect)) return;
      setStatus(error instanceof Error ? error.message : "Sign up failed.");
    }
  }

  return (
    <section className="page-shell flex min-h-[calc(100svh-8rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md bg-white/5">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>{status}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <Button className="w-full" type="submit">Create account</Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account? <Link to="/auth/sign-in" className="text-primary">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
