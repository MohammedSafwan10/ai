interface LegalPageProps {
  title: string;
  updated: string;
  sections: Array<{ title: string; body: string }>;
}

export function LegalPage({ title, updated, sections }: LegalPageProps) {
  return (
    <section className="page-shell py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase text-primary">Legal</p>
        <h1 className="mt-3 text-4xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {updated}. Review with counsel before public launch.</p>
      </div>
      <div className="mt-8 max-w-3xl space-y-4">
        {sections.map((section) => (
          <article key={section.title} className="rounded-lg border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
