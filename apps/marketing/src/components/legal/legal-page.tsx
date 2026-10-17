interface LegalPageProps {
  title: string;
  updated: string;
  sections: Array<{ title: string; body: string }>;
}
export function LegalPage({ title, updated, sections }: LegalPageProps) {
  return (
    <section className="legal-page shell">
      <h1>{title}</h1>
      <p className="caption">Last updated {updated}</p>
      <div className="legal-body">
        {sections.map((s) => (
          <article key={s.title}>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
