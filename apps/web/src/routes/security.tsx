import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, KeyRound, Laptop, LockKeyhole, Server, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/security")({ component: SecurityPage });

const principles = [
  { icon: Laptop, number: "01", title: "Local workspace", body: "Project files stay on your machine. Privora works where your code already lives." },
  { icon: ShieldCheck, number: "02", title: "Visible approvals", body: "Sensitive terminal and computer actions wait for your explicit approval." },
  { icon: KeyRound, number: "03", title: "Keys stay yours", body: "BYOK credentials remain local. Hosted credentials live only on the backend." },
];

function SecurityPage() {
  return (
    <>
      <section className="hero-grid border-b border-white/[0.07]">
        <div className="page-shell grid gap-10 py-20 md:py-28 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
          <div><div className="eyebrow"><LockKeyhole className="h-3.5 w-3.5" /> Security by design</div><h1 className="mt-6 text-5xl font-semibold leading-[.98] tracking-[-0.06em] md:text-7xl">Your machine.<br />Your permission.</h1></div>
          <p className="max-w-lg text-base leading-7 text-muted-foreground">Privora separates local workspace access from hosted accounts, keeps powerful actions visible, and never hides what the agent is doing.</p>
        </div>
      </section>
      <section className="page-shell py-16 md:py-24">
        <div className="grid gap-px border border-white/10 bg-white/10 md:grid-cols-3">
          {principles.map((item) => <article key={item.number} className="min-h-[330px] bg-background p-8"><div className="flex items-center justify-between"><item.icon className="h-7 w-7 text-primary" /><span className="font-mono text-[10px] text-white/35">{item.number}</span></div><h2 className="mt-20 text-2xl font-semibold tracking-[-0.04em]">{item.title}</h2><p className="mt-4 text-sm leading-6 text-muted-foreground">{item.body}</p></article>)}
        </div>
        <div className="mt-16 grid gap-8 border-y border-white/10 py-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div className="flex items-center gap-4"><span className="capability-icon"><Server /></span><div><p className="font-semibold">Hosted access, isolated</p><p className="mt-1 text-sm text-muted-foreground">Plans and credit limits are enforced before model requests run.</p></div></div>
          <Link to="/legal/privacy" className="inline-flex items-center gap-2 text-sm font-semibold text-primary lg:justify-self-end">Read the privacy policy <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </>
  );
}
