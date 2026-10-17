import { HomePage } from "@/pages/index";
import { DownloadPage } from "@/pages/download";
import { SecurityPage } from "@/pages/security";
import { PrivacyPage } from "@/pages/legal/privacy";
import { TermsPage } from "@/pages/legal/terms";
import { AcceptableUsePage } from "@/pages/legal/acceptable-use";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { useEffect } from "react";
export const pages = {
  "/": { component: HomePage, title: "Privora — Your work. Within reach." },
  "/download": {
    component: DownloadPage,
    title: "Download Privora for Windows",
  },
  "/security": {
    component: SecurityPage,
    title: "Access and security — Privora",
  },
  "/legal/privacy": { component: PrivacyPage, title: "Privacy — Privora" },
  "/legal/terms": { component: TermsPage, title: "Terms — Privora" },
  "/legal/acceptable-use": {
    component: AcceptableUsePage,
    title: "Acceptable use — Privora",
  },
};
export function Site({ pathname }: { pathname: string }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.animate(
            [
              { opacity: 0, transform: "translateY(24px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 650, easing: "cubic-bezier(.2,.7,.2,1)" },
          );
          observer.unobserve(entry.target);
        }),
      { threshold: 0.12 },
    );
    document
      .querySelectorAll("main > section:not(.hero) .reveal")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pathname]);
  const page =
    pages[(pathname.replace(/\/$/, "") || "/") as keyof typeof pages];
  const Page = page?.component;
  return (
    <>
      <SiteHeader />
      <main id="main">
        {Page ? (
          <Page />
        ) : (
          <section className="page-hero shell">
            <h1>Page not found.</h1>
            <a className="text-link" href="/">
              Return to Privora
            </a>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
