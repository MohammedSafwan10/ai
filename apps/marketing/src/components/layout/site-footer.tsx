export function SiteFooter() {
  return (
    <footer className="site-footer shell">
      <p className="footer-name">
        <a href="/">Privora</a>
      </p>
      <div className="footer-bottom">
        <p>A free desktop. Your own models.</p>
        <nav aria-label="Footer navigation">
          <a href="/download/">Download</a>
          <a href="/security/">Security</a>
          <a href="/legal/privacy/">Privacy</a>
          <a href="/legal/terms/">Terms</a>
          <a href="/legal/acceptable-use/">Acceptable use</a>
          <a href="https://github.com/MohammedSafwan10/privora-desktop">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
