export function SecurityPage() {
  return (
    <>
      <section className="page-hero shell">
        <h1 className="reveal">
          Know where
          <br />
          work happens.
        </h1>
        <p className="reveal">
          Local files, your chosen model provider, and an optional connected
          Kali environment. Each has a different role.
        </p>
      </section>
      <section className="security-flow shell">
        <article className="reveal">
          <h2>Your computer.</h2>
          <p>
            Build projects use a folder you choose. Local tools can read and
            change files and run commands within the access you grant. Chats and
            project state are stored on the desktop.
          </p>
        </article>
        <article className="reveal">
          <h2>Your provider.</h2>
          <p>
            Hosted model requests send prompts and relevant tool context to your
            configured provider using your credentials. Its retention policy,
            terms, charges and usage limits apply.
          </p>
        </article>
        <article className="reveal">
          <h2>Your environment.</h2>
          <p>
            Security projects can run tools in a connected Kali environment.
            Remote commands run there. Collected artifacts can be brought back
            to Privora and saved to your PC.
          </p>
        </article>
      </section>
      <section className="security-access dark-field">
        <div className="shell section-lead">
          <h2 className="reveal">
            Set the access.
            <br />
            Review the work.
          </h2>
          <div>
            <p className="reveal">
              Choose an access mode before running a task. Approval behavior
              depends on that mode; Full access permits broader actions without
              asking at each step.
            </p>
            <p className="reveal">
              Tool activity and file changes remain available for review. Use
              connected security tools only against systems you own or are
              authorized to test.
            </p>
            <a className="text-link reveal" href="/legal/privacy/">
              Read the privacy policy
            </a>
          </div>
        </div>
      </section>
      <section className="closing shell">
        <h2 className="reveal">
          Keep control
          <br />
          of the context.
        </h2>
        <div>
          <p className="reveal">
            Review what you attach and the permissions you grant. Your provider
            receives the context used for a request.
          </p>
          <a className="button primary reveal" href="/download/">
            Get Privora for Windows
          </a>
        </div>
      </section>
    </>
  );
}
