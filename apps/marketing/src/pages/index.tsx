import { useState, type KeyboardEvent } from "react";
const views = [
  {
    name: "Files",
    image: "workspace-files.png",
    title: "Start with your folder.",
    copy: "Read project files beside the conversation. Keep the work grounded in the code you already have.",
    crop: "files-crop",
    alt: "Current Privora file viewer showing the sample Fieldnotes README",
  },
  {
    name: "Browser",
    image: "browser-preview.png",
    title: "See what you’re building.",
    copy: "Open a local preview in the built-in browser. Check desktop, tablet and phone views without losing the conversation.",
    crop: "browser-crop",
    alt: "Current Privora browser showing the sample Fieldnotes page",
  },
  {
    name: "Chat & tools",
    image: "chat-tools.png",
    title: "Follow the whole task.",
    copy: "Read the conversation in order. Expand tool activity when you need the detail, then return to the result.",
    crop: "chat-crop",
    alt: "Actual Privora chat components with an illustrative conversation and plain tool summaries",
  },
];
function WorkspaceExplorer() {
  const [selected, setSelected] = useState(0);
  const view = views[selected];
  function navigate(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % views.length
        : e.key === "ArrowLeft"
          ? (index + views.length - 1) % views.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? views.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setSelected(next);
    document.getElementById(`view-tab-${next}`)?.focus();
  }
  return (
    <div className="workspace-explorer">
      <div className="explorer-copy">
        <h2 className="reveal">
          One place.
          <br />
          The whole task.
        </h2>
        <div
          className="view-tabs reveal"
          role="tablist"
          aria-label="Explore the Privora workspace"
        >
          {views.map((item, index) => (
            <button
              key={item.name}
              id={`view-tab-${index}`}
              role="tab"
              aria-selected={selected === index}
              aria-controls="workspace-view"
              tabIndex={selected === index ? 0 : -1}
              onKeyDown={(e) => navigate(e, index)}
              onClick={() => setSelected(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div
          id="workspace-view"
          role="tabpanel"
          aria-labelledby={`view-tab-${selected}`}
          tabIndex={0}
          className="view-description"
          aria-live="polite"
        >
          <h3>{view.title}</h3>
          <p>{view.copy}</p>
        </div>
        <p className="caption reveal">
          Current interface. Sample project and conversation.
        </p>
      </div>
      <div
        className={`interface-crop explorer-image ${view.crop} reveal`}
        key={view.name}
      >
        <img src={`/media/${view.image}`} alt={view.alt} loading="lazy" />
      </div>
    </div>
  );
}
const questions = [
  [
    "Is Privora free?",
    "Yes. The desktop app is free to download and use. Bring your own model access; your chosen provider may charge for usage.",
  ],
  [
    "Do I need a Privora account?",
    "No. Open the desktop app, connect your model provider in Settings, and choose a project folder.",
  ],
  [
    "Does everything run offline?",
    "Your project files and chat history are stored locally. Hosted models, web research and connected remote tools need a network connection. Relevant prompts and tool context are sent to the provider you choose.",
  ],
  [
    "What is the Kali connection for?",
    "Security projects can use a connected Kali environment for authorized testing. Those commands run in that environment; collected evidence can be saved back to your PC.",
  ],
];
export function HomePage() {
  return (
    <>
      <section className="hero shell">
        <h1 className="reveal">
          Your work.
          <br />
          Within reach.
        </h1>
        <p className="hero-description reveal">
          A free AI desktop for your projects. Bring your own model key.
        </p>
        <a className="button primary reveal" href="/download/">
          Get Privora for Windows
        </a>
        <figure className="hero-product reveal">
          <div className="product-motion">
            <img
              src="/media/desktop-demo.webp"
              alt="Illustrative Privora desktop conversation using GPT-6 Astra, with the built-in browser beside the chat"
              width="2031"
              height="774"
              fetchPriority="high"
            />
          </div>
          <figcaption>
            Privora desktop · Illustrative demo conversation
          </figcaption>
        </figure>
      </section>
      <section id="product" className="product-section shell">
        <WorkspaceExplorer />
      </section>
      <section className="work-section dark-field">
        <div className="shell">
          <div className="section-lead">
            <h2 className="reveal">
              Make progress.
              <br />
              Keep the detail.
            </h2>
            <p className="reveal">
              Read files, run commands, inspect changes and hand focused work to
              subagents. The activity stays with the conversation, so you can
              check how a result was reached.
            </p>
          </div>
          <div className="proof-pair">
            <figure className="reveal">
              <div className="interface-crop proof-files">
                <img
                  src="/media/workspace-files.png"
                  alt="Privora’s current file viewer displaying a README in a demo workspace"
                  width="1920"
                  height="1032"
                  loading="lazy"
                />
              </div>
              <figcaption>Local project files, beside the work.</figcaption>
            </figure>
            <div className="proof-chat">
              <figure className="reveal">
                <div className="interface-crop chat-detail">
                  <img
                    src="/media/chat-tools.png"
                    alt="Actual Privora message and tool-summary rendering with sample content"
                    width="680"
                    height="680"
                    loading="lazy"
                  />
                </div>
                <figcaption>
                  Plain tool summaries. Expand for the details.
                </figcaption>
              </figure>
              <p className="reveal">
                Choose an access mode for the task. Review tool activity and
                file changes before you take the next step.
              </p>
              <a className="text-link reveal" href="/security/">
                How access works
              </a>
            </div>
          </div>
        </div>
      </section>
      <section className="model-section shell" id="models">
        <div>
          <h2 className="reveal">
            Your models.
            <br />
            Your choice.
          </h2>
          <p className="reveal">
            Connect a supported provider with your own key or endpoint. Pick the
            model and reasoning level in the composer, and set a separate model
            for subagents when the work calls for it.
          </p>
          <p className="reveal">
            Privora is free. Model usage is between you and your provider.
          </p>
        </div>
        <figure className="reveal">
          <div className="interface-crop model-detail">
            <img
              src="/media/desktop-demo.webp"
              alt="The Privora composer with its GPT-6 Astra model selector, reasoning level and access mode"
              width="2031"
              height="774"
              loading="lazy"
            />
          </div>
          <figcaption>
            Model selection in the desktop composer. Illustrative demo.
          </figcaption>
        </figure>
      </section>
      <section className="faq-section shell" id="questions">
        <h2 className="reveal">Before you start.</h2>
        <div className="faq-list">
          {questions.map(([q, a]) => (
            <details className="reveal" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="closing shell">
        <h2 className="reveal">
          Bring a project.
          <br />
          Make it happen.
        </h2>
        <div>
          <p className="reveal">
            Download Privora for Windows, connect your model, and open a folder.
          </p>
          <a className="button primary reveal" href="/download/">
            Get Privora for Windows
          </a>
        </div>
      </section>
    </>
  );
}
