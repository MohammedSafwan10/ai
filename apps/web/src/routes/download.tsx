import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Apple, ArrowDownToLine, Check, CirclePlay, Cpu, HardDrive, Monitor, ShieldCheck, Terminal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { WINDOWS_DESKTOP_DOWNLOAD_URL, WINDOWS_DESKTOP_RELEASE_URL } from "@/lib/desktop-download";
import { PRIVORA_DEMO_VIDEO_URL } from "@/lib/marketing-assets";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/download")({ component: DownloadPage });

const requirements = [
  { icon: Monitor, label: "Windows", value: "Windows 10 or later" },
  { icon: Cpu, label: "Processor", value: "64-bit Intel or AMD" },
  { icon: HardDrive, label: "Updates", value: "Automatic stable channel" },
];

function DownloadPage() {
  const [playing, setPlaying] = React.useState(false);
  const [version, setVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch(WINDOWS_DESKTOP_RELEASE_URL, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Release metadata unavailable")))
      .then((release: { version?: unknown }) => {
        if (typeof release.version === "string" && /^\d+\.\d+\.\d+$/.test(release.version)) setVersion(release.version);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setVersion(null);
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <section className="hero-grid overflow-hidden border-b border-white/[0.07]">
        <div className="page-shell grid min-h-[720px] items-center gap-16 py-20 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="relative z-10">
            <div className="eyebrow"><span className="status-pulse" /> Privora desktop</div>
            <h1 className="mt-7 text-5xl font-semibold leading-[.98] tracking-[-0.06em] md:text-7xl">Your agent.<br />On your machine.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">Run Privora inside your real project folders with local tools, visible approvals, and the models you choose.</p>
            <a href={WINDOWS_DESKTOP_DOWNLOAD_URL} className={cn(buttonVariants({ size: "lg" }), "hero-primary mt-9 w-full sm:w-auto")}>
              <ArrowDownToLine className="h-5 w-5" /> {version ? `Download v${version} for Windows` : "Download for Windows"}
            </a>
            <p className="mt-4 text-xs text-white/40">Windows x64 · {version ? `Version ${version}` : "Latest stable version"} · Automatic updates</p>
          </div>

          <div className="relative">
            <div className="absolute inset-8 bg-violet-500/15 blur-[80px]" />
            <div className="relative border border-white/15 bg-[#0c1017] p-3 shadow-[0_40px_100px_rgba(0,0,0,.55)]">
              <div className="flex h-10 items-center border-b border-white/[0.08] px-3 text-[10px] text-white/45">
                <span className="flex gap-1.5"><i className="window-dot bg-[#ff6d63]" /><i className="window-dot bg-[#f6bd4f]" /><i className="window-dot bg-[#56c56d]" /></span>
                <span className="mx-auto">Privora · Workspace</span>
              </div>
              <div className="relative aspect-video overflow-hidden bg-[#070a10]">
                {playing ? <video className="h-full w-full object-cover" src={PRIVORA_DEMO_VIDEO_URL} poster="/privora-poster.png" controls autoPlay muted playsInline preload="auto" aria-label="Privora desktop demo" /> : <button type="button" className="group block h-full w-full" onClick={() => setPlaying(true)} aria-label="Play Privora desktop demo"><img src="/privora-poster.png" alt="Privora desktop workspace" className="h-full w-full object-cover object-[center_35%] opacity-90 transition duration-500 group-hover:scale-[1.015] group-hover:opacity-100" /><span className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/75 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[.16em] text-white backdrop-blur-md"><CirclePlay className="h-4 w-4 text-primary" /> Play demo</span></button>}
              </div>
              <div className="grid grid-cols-3 border-t border-white/[0.08] text-center text-[10px] uppercase tracking-[0.12em] text-white/45">
                <span className="border-r border-white/[0.08] py-3">Local workspace</span><span className="border-r border-white/[0.08] py-3">Approval controls</span><span className="py-3">Your models</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell py-20 md:py-28">
        <div className="grid gap-px border border-white/[0.09] bg-white/[0.09] md:grid-cols-3">
          {requirements.map((item) => (
            <article key={item.label} className="bg-background p-7">
              <item.icon className="h-6 w-6 text-primary" />
              <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{item.label}</p>
              <h2 className="mt-2 text-lg font-medium">{item.value}</h2>
            </article>
          ))}
        </div>

        <div className="mt-20 grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div><p className="section-kicker">Install and start</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] md:text-5xl">From download to first task in minutes.</h2></div>
          <ol className="border-t border-white/10">
            {["Download and run the Windows installer", "Open a project folder you control", "Connect Gemini, OpenRouter, or CLIProxy", "Give Privora a task and review every action"].map((step, index) => (
              <li key={step} className="flex items-center gap-5 border-b border-white/10 py-5 text-sm text-white/75"><span className="font-mono text-[10px] text-primary">0{index + 1}</span>{step}<Check className="ml-auto h-4 w-4 text-primary" /></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-white/[0.07] bg-[#0a0d13]">
        <div className="page-shell grid gap-10 py-20 md:grid-cols-2 md:items-center">
          <div><ShieldCheck className="h-8 w-8 text-primary" /><h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">Built for local control.</h2><p className="mt-4 max-w-xl leading-7 text-muted-foreground">Your workspace stays on your machine. Sensitive actions require approval, and your provider credentials remain yours.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-white/10 p-6"><Apple className="h-5 w-5 text-white/55" /><strong className="mt-5 block">macOS</strong><span className="mt-2 block text-sm text-muted-foreground">Coming soon</span></div>
            <div className="border border-white/10 p-6"><Terminal className="h-5 w-5 text-white/55" /><strong className="mt-5 block">Linux</strong><span className="mt-2 block text-sm text-muted-foreground">Coming soon</span></div>
          </div>
        </div>
      </section>
    </>
  );
}
