import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MonitorCheck, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { clearCurrentSessionIfAny, isUnauthenticatedAppwriteError } from "@/lib/auth";
import {
  buildDesktopConnectRedirect,
  desktopConnectSchema,
  desktopConnectStatus,
  isLocalDesktopCallbackUrl,
} from "@/lib/desktop-link";

export const Route = createFileRoute("/desktop/connect")({
  validateSearch: (search) => desktopConnectSchema.parse(search),
  component: DesktopConnectPage,
});

function DesktopConnectPage() {
  const search = Route.useSearch();
  const hasState = Boolean(search.state);
  const canUseLocalBridge = hasState && isLocalDesktopCallbackUrl(search.callback);
  const isLocalPage = typeof window !== "undefined" && window.location.hostname === "localhost";
  const redirect = buildDesktopConnectRedirect(search);
  const [status, setStatus] = React.useState(
    canUseLocalBridge ? "Checking your Privora account..." : desktopConnectStatus.futureBackend,
  );
  const [signedIn, setSignedIn] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [connecting, setConnecting] = React.useState(false);
  const [connected, setConnected] = React.useState(false);

  const finishConnection = React.useCallback(async (profile?: { email?: string; name?: string }) => {
    if (!search.callback || !search.state || !canUseLocalBridge) {
      setStatus(desktopConnectStatus.signedInMissingCallback);
      return false;
    }

    setConnecting(true);
    setConnected(false);
    setStatus("Connecting Privora Desktop...");
    try {
      const duration = 3600;
      const token = await account.createJWT({ duration });
      const response = await fetch(search.callback, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: search.state,
          jwt: token.jwt,
          expiresAt: Date.now() + duration * 1000,
          email: profile?.email || email,
          name: profile?.name || profile?.email || email,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Desktop connection failed.");
      setConnected(true);
      setStatus("Privora Desktop is connected. You can return to the app.");
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Desktop connection failed. Start sign-in from Privora Desktop again.");
      return false;
    } finally {
      setConnecting(false);
    }
  }, [canUseLocalBridge, search.callback, search.state]);

  React.useEffect(() => {
    let canceled = false;

    const connect = async () => {
      if (!isAppwriteConfigured) {
        setStatus("Appwrite environment variables are not configured for this site yet.");
        return;
      }
      try {
        const user = await account.get();
        if (canceled) return;
        setSignedIn(true);
        setEmail(user.email || user.name || "");
        if (!canUseLocalBridge || !search.callback || !search.state) {
          setStatus(desktopConnectStatus.signedInMissingCallback);
          return;
        }
        await finishConnection({ email: user.email, name: user.name });
      } catch (error) {
        if (canceled) return;
        setSignedIn(false);
        setEmail("");
        if (isUnauthenticatedAppwriteError(error)) {
          await clearCurrentSessionIfAny();
          setStatus("Sign in to continue connecting Privora Desktop.");
          return;
        }
        setStatus(error instanceof Error ? error.message : "Sign in to connect Privora Desktop.");
      }
    };

    void connect();
    return () => {
      canceled = true;
    };
  }, [canUseLocalBridge, finishConnection, search.callback, search.state]);

  return (
    <section className="page-shell flex min-h-[calc(100svh-8rem)] items-center justify-center py-16">
      <Card className="w-full max-w-xl bg-white/5">
        <CardHeader>
          <MonitorCheck className="h-8 w-8 text-primary" />
          <CardTitle className="mt-3">Connect Privora Desktop</CardTitle>
          <CardDescription>{hasState ? desktopConnectStatus.ready : desktopConnectStatus.missingState}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
            {status || (canUseLocalBridge ? desktopConnectStatus.localBridge : desktopConnectStatus.futureBackend)}
            {signedIn && email && <span className="mt-2 block text-foreground">Signed in as {email}.</span>}
          </div>
          <div className="flex flex-wrap gap-3">
            {!signedIn && <Link to="/auth/sign-in" search={{ redirect }} className={buttonVariants()}>Sign in</Link>}
            {signedIn && canUseLocalBridge && !connected && (
              <Button type="button" disabled={connecting} onClick={() => void finishConnection()}>
                <RotateCw className="h-4 w-4" />
                {connecting ? "Connecting" : "Finish connection"}
              </Button>
            )}
            {connected && isLocalPage && (
              <Button type="button" onClick={() => window.close()}>
                Return to desktop
              </Button>
            )}
            {connected && !isLocalPage && <a href="privora://settings/billing" className={buttonVariants()}>Return to desktop</a>}
            {signedIn && <Link to="/account" className={buttonVariants()}>Account</Link>}
            {signedIn && !canUseLocalBridge && isLocalPage && (
              <Button type="button" onClick={() => window.close()}>
                Return to desktop
              </Button>
            )}
            {signedIn && !canUseLocalBridge && !isLocalPage && <a href="privora://settings/billing" className={buttonVariants()}>Return to desktop</a>}
            <Link to="/pricing" className={buttonVariants({ variant: "secondary" })}>View pricing</Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
