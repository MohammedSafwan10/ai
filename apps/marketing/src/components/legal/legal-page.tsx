interface LegalPageProps {
  title: string;
  updated: string;
  sections: Array<{ title: string; body: string }>;
}

export function LegalPage({ title, updated, sections }: LegalPageProps) {
  return (
    <section className="page-shell py-16 md:py-24">
      <div className="max-w-3xl border-b border-white/10 pb-10">
        <p className="section-kicker">Legal / Privora</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] md:text-6xl">{title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated {updated}</p>
      </div>
      <div className="max-w-3xl">
        {sections.map((section, index) => (
          <article key={section.title} className="grid gap-4 border-b border-white/10 py-8 md:grid-cols-[48px_1fr]">
            <span className="font-mono text-[10px] text-primary">{String(index + 1).padStart(2, "0")}</span>
            <div><h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}
