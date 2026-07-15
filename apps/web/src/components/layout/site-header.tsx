import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, LogIn, LogOut, Menu } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { clearCurrentSessionIfAny, isUnauthenticatedAppwriteError } from "@/lib/auth";
import { detectDesktopPlatform, getDesktopDownloadTarget, type DesktopPlatform } from "@/lib/desktop-download";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
];

export function SiteHeader() {
  const [userEmail, setUserEmail] = React.useState("");
  const [desktopPlatform, setDesktopPlatform] = React.useState<DesktopPlatform>("unknown");
  const [mobileOpen, setMobileOpen] = React.useState(false);

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

  React.useEffect(() => {
    setDesktopPlatform(detectDesktopPlatform(window.navigator.userAgent, window.navigator.platform));
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

  const downloadTarget = getDesktopDownloadTarget(desktopPlatform);

  return (
    <header className="site-header sticky top-0 z-50 border-b border-white/[0.07] bg-background/82 backdrop-blur-2xl">
      <div className="wide-shell flex h-[4.5rem] items-center gap-4">
        <Link to="/" className="group flex items-center gap-3" aria-label="Privora home">
          <img src="/privora-logo.png" alt="" className="h-9 w-9 rounded-[8px]" />
          <span className="text-[13px] font-bold uppercase tracking-[0.32em]">Privora</span>
        </Link>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex" aria-label="Main navigation">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition hover:text-foreground"
            >
              {item.label}
            </a>
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
            <Link to="/auth/sign-in" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>
              <LogIn className="hidden h-4 w-4 md:block" />
              Sign in
            </Link>
          )}
          <a
            href={downloadTarget.href}
            className={cn(buttonVariants({ size: "sm" }), "header-download")}
            aria-label={downloadTarget.ariaLabel}
          >
            <ArrowDownToLine className="h-4 w-4" />
            {downloadTarget.label}
          </a>
          <button type="button" className="flex h-9 w-9 items-center justify-center text-muted-foreground lg:hidden" aria-label="Open navigation menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      {mobileOpen ? <nav className="wide-shell grid border-t border-white/[0.07] py-3 lg:hidden" aria-label="Mobile navigation">{navItems.map((item) => <a key={item.href} href={item.href} className="border-b border-white/[0.06] py-3 text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>{item.label}</a>)}<Link to="/account" className="py-3 text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Account</Link></nav> : null}
    </header>
  );
}
