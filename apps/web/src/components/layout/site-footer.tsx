import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/8 py-10">
      <div className="page-shell flex flex-col gap-6 text-sm text-muted-foreground md:flex-row md:items-center">
        <div>
          <div className="font-semibold text-foreground">Privora</div>
          <p className="mt-1">Local-first agent workspace with hosted AI credits when you need them.</p>
        </div>
        <div className="flex flex-wrap gap-4 md:ml-auto">
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/refund">Refund</Link>
          <Link to="/legal/acceptable-use">Acceptable use</Link>
        </div>
      </div>
    </footer>
  );
}
