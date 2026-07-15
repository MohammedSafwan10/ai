import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.07] py-12">
      <div className="wide-shell flex flex-col gap-8 text-sm text-muted-foreground md:flex-row md:items-end">
        <div>
          <Link to="/" className="flex items-center gap-3 text-foreground">
            <img src="/privora-logo.png" alt="" className="h-9 w-9 rounded-[8px]" />
            <span className="text-xs font-bold uppercase tracking-[0.3em]">Privora</span>
          </Link>
          <p className="mt-4 max-w-md leading-6">A local-first coding agent with real tools, reviewable changes, and your choice of models.</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-3 md:ml-auto">
          <Link to="/download">Download</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/security">Security</Link>
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/terms">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
