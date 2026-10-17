export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header shell">
        <a className="brand" href="/" aria-label="Privora home">
          <img src="/privora-logo.png" alt="" width="40" height="40" />
          <span>Privora</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/#product">Product</a>
          <a href="/security/">Security</a>
          <a href="https://github.com/MohammedSafwan10/privora-desktop">
            Source
          </a>
        </nav>
      </header>
    </>
  );
}
