import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CirclePlay,
  Code2,
  Eye,
  FolderCode,
  Globe2,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: HomePage });

const capabilities = [
  { icon: TerminalSquare, label: "Real tools", copy: "Terminal, files, browser, and scripts—the tools you already trust." },
  { icon: Eye, label: "Reviewable changes", copy: "See every edit, approve with confidence, and keep full context." },
  { icon: KeyRound, label: "Your models", copy: "Connect Gemini, OpenRouter, or CLIProxy without changing your flow." },
  { icon: LockKeyhole, label: "Local control", copy: "Your code stays on your machine. No sync. No leaks. No compromises." },
];

const modelNames = ["Gemini", "OpenRouter", "CLIProxy", "Bring your own key"];

function ProductDemo({ playing, onPlay }: { playing: boolean; onPlay: () => void }) {
  return (
    <div id="demo" className="product-stage scroll-mt-24">
      <div className="product-glow" />
      <div className="product-window">
        <div className="product-titlebar">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="window-dot bg-[#ff6d63]" />
            <span className="window-dot bg-[#f6bd4f]" />
            <span className="window-dot bg-[#56c56d]" />
          </div>
          <span className="text-[11px] font-medium text-white/60">Privora</span>
          <div className="flex gap-2 text-white/35" aria-hidden="true"><span>□</span><span>◇</span><span>⌗</span></div>
        </div>
        <div className="product-tabs" aria-hidden="true">
          <span className="product-tab product-tab-active"><FolderCode className="h-3.5 w-3.5" /> Workspace</span>
          <span className="product-tab"><Code2 className="h-3.5 w-3.5" /> Files</span>
          <span className="product-tab"><Eye className="h-3.5 w-3.5" /> Review</span>
          <span className="product-tab"><Globe2 className="h-3.5 w-3.5" /> Browser</span>
        </div>
        <div className="relative aspect-video overflow-hidden bg-[#080b13]">
          {playing ? (
            <video className="block h-full w-full bg-[#080b13] object-cover" src="/privora-demo.mp4" controls autoPlay playsInline aria-label="Privora product demonstration" />
          ) : (
            <button type="button" className="group block h-full w-full overflow-hidden text-left" onClick={onPlay} aria-label="Play the Privora product demonstration">
              <img src="/privora-poster.png" alt="Privora running a polished browser game inside its desktop workspace" className="h-full w-full object-cover object-[center_32%] opacity-90 transition duration-500 group-hover:scale-[1.015] group-hover:opacity-100" />
              <span className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/75 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[.16em] text-white backdrop-blur-md"><CirclePlay className="h-4 w-4 text-primary" /> Play demo</span>
            </button>
          )}
        </div>
        <div className="product-statusbar">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> main</span>
          <span className="ml-auto flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Local</span>
        </div>
      </div>
      <div className="product-callout-list" aria-label="Privora capabilities">
        <div className="product-callout"><Bot /><span><strong>Reviewer Swarm</strong><small>Two agents check the work</small></span></div>
        <div className="product-callout"><Globe2 /><span><strong>Built-in browser</strong><small>Research, test, and debug</small></span></div>
        <div className="product-callout"><KeyRound /><span><strong>BYOK</strong><small>Your models, your rules</small></span></div>
      </div>
    </div>
  );
}

function HomePage() {
  const [demoPlaying, setDemoPlaying] = React.useState(false);

  function playDemo() {
    setDemoPlaying(true);
    window.requestAnimationFrame(() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  return (
    <>
      <section className="hero-grid overflow-hidden border-b border-white/[0.07]">
        <div className="wide-shell relative py-16 md:py-20">
          <div className="hero-copy relative z-10">
            <div className="eyebrow"><span className="status-pulse" /> Local-first coding agent</div>
            <h1>Your codebase.<br />Your tools.<br /><span>Your agent.</span></h1>
            <p>A local-first coding agent with real tools, reviewable changes, and your choice of models.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/download" className={cn(buttonVariants({ size: "lg" }), "hero-primary w-full sm:w-auto")}>
                <ArrowDownToLine className="h-5 w-5" /> Download for Windows
              </Link>
              <button type="button" onClick={playDemo} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "hero-secondary w-full sm:w-auto")}>
                <CirclePlay className="h-5 w-5" /> Watch the demo
              </button>
            </div>
            <div className="hero-assurances">
              <span><LockKeyhole /> Runs locally</span>
              <span><Braces /> Open providers</span>
              <span><ShieldCheck /> Your data stays yours</span>
            </div>
          </div>
          <div className="hero-product"><ProductDemo playing={demoPlaying} onPlay={playDemo} /></div>
        </div>
      </section>

      <section className="capability-strip">
        <div className="wide-shell grid md:grid-cols-2 xl:grid-cols-4">
          {capabilities.map((item) => (
            <article key={item.label} className="capability-item">
              <span className="capability-icon"><item.icon /></span>
              <div><h2>{item.label}</h2><p>{item.copy}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="page-shell py-24 md:py-32">
        <div className="section-intro">
          <div><p className="section-kicker">Built for real work</p><h2>One focused workspace.<br />Every tool your agent needs.</h2></div>
          <p>Privora works inside your project, not around it. Give the agent a goal, stay in control of each meaningful action, and review the result before it lands.</p>
        </div>
        <div className="feature-editorial mt-14">
          <article className="feature-main">
            <div className="feature-number">01 / AGENT WORKSPACE</div>
            <TerminalSquare className="mt-12 h-9 w-9 text-primary" />
            <h3>Files, terminal, browser—one continuous flow.</h3>
            <p>The agent reads your codebase, runs commands, tests in the built-in browser, and keeps project context across long sessions.</p>
            <div className="terminal-sample" aria-label="Example Privora agent activity">
              <div><span className="text-primary">●</span> Inspecting workspace</div>
              <div><span className="text-violet-300">◆</span> Updating the renderer</div>
              <div><span className="text-primary">✓</span> Tests passed · 24/24</div>
            </div>
          </article>
          <article className="feature-review">
            <div className="feature-number">02 / REVIEWER SWARM</div>
            <div className="review-orbit" aria-hidden="true"><span>MAIN</span><i>R1</i><i>R2</i></div>
            <h3>More eyes before the final answer.</h3>
            <p>Two read-only reviewers inspect the work independently, then the main agent resolves their findings before handing it back.</p>
          </article>
          <article className="feature-approval">
            <div className="feature-number">03 / APPROVALS</div>
            <div className="approval-card"><span><ShieldCheck /> Permission required</span><p>Run a command outside the workspace?</p><div><button type="button">Deny</button><button type="button">Approve</button></div></div>
            <h3>You decide what runs.</h3>
            <p>Guardrails keep sensitive computer and terminal actions visible and deliberate.</p>
          </article>
        </div>
      </section>

      <section className="models-section border-y border-white/[0.07]">
        <div className="page-shell grid gap-14 py-24 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div>
            <p className="section-kicker">Bring your own models</p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em] md:text-6xl">Your stack.<br />No lock-in.</h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">Use the providers you already trust. Switch models without leaving the workspace or changing how you work.</p>
            <Link to="/pricing" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary">Explore access options <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="provider-list">
            {modelNames.map((name, index) => <div key={name}><span>0{index + 1}</span><strong>{name}</strong><Check className="ml-auto h-4 w-4 text-primary" /></div>)}
          </div>
        </div>
      </section>

      <section className="page-shell py-24 md:py-32">
        <div className="final-cta">
          <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> Built to stay out of your way</div>
          <h2>Put an agent inside<br />your real workflow.</h2>
          <p>Download Privora for Windows and start with your own models.</p>
          <Link to="/download" className={cn(buttonVariants({ size: "lg" }), "hero-primary mt-8")}>
            Download Privora <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </>
  );
}
