import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, LogIn, LogOut } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { clearCurrentSessionIfAny, isUnauthenticatedAppwriteError } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/pricing", label: "Pricing" },
  { to: "/security", label: "Security" },
  { to: "/account", label: "Account" },
];

export function SiteHeader() {
  const [userEmail, setUserEmail] = React.useState("");

  React.useEffect(() => {
    let canceled = false;

    const refreshUser = async () => {
      if (!isAppwriteConfigured) return;
      try {
        const user = await account.get();
        if (!canceled) setUserEmail(user.email || user.name || "");
      } catch (error) {
        if (isUnauthenticatedAppwriteError(error)) await clearCurrentSessionIfAny();
        if (!canceled) setUserEmail("");
      }
    };

    void refreshUser();
    window.addEventListener("focus", refreshUser);
    return () => {
      canceled = true;
      window.removeEventListener("focus", refreshUser);
    };
  }, []);

  const signOut = async () => {
    try {
      await account.deleteSession({ sessionId: "current" });
    } catch {
      // If the session already expired, the UI should still settle into signed-out state.
    } finally {
      setUserEmail("");
      if (window.location.pathname.startsWith("/account")) window.location.assign("/auth/sign-in");
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-background/72 backdrop-blur-xl">
      <div className="page-shell flex h-16 items-center gap-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-black text-primary-foreground">P</span>
          <span className="text-base font-semibold">Privora</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-white/7 hover:text-foreground"
              activeProps={{ className: "rounded-md bg-white/8 px-3 py-2 text-sm text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {userEmail ? (
            <>
              <Link to="/account" className="hidden max-w-44 truncate rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-white/7 hover:text-foreground md:block">
                {userEmail}
              </Link>
              <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => void signOut()}>
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </>
          ) : (
            <Link to="/auth/sign-in" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden md:inline-flex")}>
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          )}
          <Link to="/download" className={buttonVariants({ size: "sm" })}>
            <ArrowDownToLine className="h-4 w-4" />
            Download
          </Link>
        </div>
      </div>
    </header>
  );
}
