import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowRight, BadgeCheck, Bot, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const pillars = [
  { icon: KeyRound, title: "BYOK on every plan", body: "Free users can bring their own keys. Paid users still keep BYOK as a fallback." },
  { icon: Bot, title: "Hosted AI credits", body: "Plus and Pro unlock Privora-hosted models through a server-side gateway." },
  { icon: ShieldCheck, title: "Desktop stays private", body: "No provider secrets in the app bundle. Hosted keys stay on the backend." },
];

const flow = ["Sign in on the web", "Connect Privora Desktop", "Use BYOK or hosted credits", "Track usage clearly"];

function HomePage() {
  return (
    <>
      <section className="page-shell grid min-h-[calc(100svh-4rem)] items-center gap-10 py-16 lg:grid-cols-[1fr_0.82fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Local-first agent workspace, SaaS-ready billing
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-normal md:text-7xl">Privora</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            A calm desktop workspace for serious agent runs: bring your own keys for free, or sign in for hosted AI credits when you want Privora to handle the model gateway.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/download" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
              <ArrowDownToLine className="h-5 w-5" />
              Download for Windows
            </Link>
            <Link to="/pricing" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}>
              View pricing
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
        <div className="glass-panel rounded-lg p-5">
          <div className="rounded-md border border-white/10 bg-background/72 p-4">
            <div className="mb-4 flex items-center justify-between border-b border-white/8 pb-3">
              <div>
                <p className="text-sm font-semibold">Desktop account</p>
                <p className="text-xs text-muted-foreground">Connected through browser auth</p>
              </div>
              <span className="rounded-full bg-primary/16 px-2 py-1 text-xs font-semibold text-primary">Secure</span>
            </div>
            <div className="space-y-3">
              {flow.map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-md bg-white/5 p-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/8 text-sm font-semibold">{index + 1}</span>
                  <span className="text-sm">{item}</span>
                  {index === flow.length - 1 ? <BadgeCheck className="ml-auto h-4 w-4 text-primary" /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="page-shell py-16">
        <SectionHeading
          eyebrow="SaaS without weirdness"
          title="Transparent model access, local workspace control."
          body="Privora separates the public SaaS surface from the desktop app. The website handles auth, pricing, policy, and billing; the desktop focuses on work."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {pillars.map((pillar) => (
            <Card key={pillar.title} className="bg-white/5">
              <CardContent className="pt-5">
                <pillar.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-5 text-lg font-semibold">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{pillar.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
