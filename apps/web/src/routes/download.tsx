import { createFileRoute } from "@tanstack/react-router";
import { Apple, ArrowDownToLine, Check, Laptop, Monitor, Terminal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { WINDOWS_DESKTOP_DOWNLOAD_URL } from "@/lib/desktop-download";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/download")({
  component: DownloadPage,
});

const availableFeatures = [
  "Windows 10 or later",
  "64-bit Intel or AMD processor",
  "Automatic stable updates",
];

const upcomingPlatforms = [
  { icon: Apple, name: "macOS", detail: "Apple silicon and Intel support is coming soon." },
  { icon: Terminal, name: "Linux", detail: "Linux desktop packages are coming soon." },
];

function DownloadPage() {
  return (
    <>
      <section className="page-shell py-16 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold text-primary">Privora Desktop</p>
            <h1 className="mt-3 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-normal md:text-7xl">
              Download for Windows
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Install Privora Desktop to run local-first AI agent workflows inside your real project folders.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={WINDOWS_DESKTOP_DOWNLOAD_URL}
                className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
              >
                <ArrowDownToLine className="h-5 w-5" />
                Download Windows installer
              </a>
            </div>
            <div className="mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              {availableFeatures.map((feature) => (
                <span key={feature} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  {feature}
                </span>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Reinstalling or updating manually? Fully quit Privora before running the installer.
            </p>
          </div>

          <div className="glass-panel rounded-lg p-5">
            <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-white/10 bg-background/72">
              <div className="text-center">
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-lg bg-primary/16 text-primary">
                  <Monitor className="h-10 w-10" />
                </span>
                <p className="mt-5 text-lg font-semibold">Privora Desktop for Windows</p>
                <p className="mt-2 text-sm text-muted-foreground">Stable channel · Windows x64</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/8 py-16">
        <div className="page-shell">
          <SectionHeading
            eyebrow="More platforms"
            title="macOS and Linux are next."
            body="Windows is available today. The other desktop builds will appear here when they are ready."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {upcomingPlatforms.map((platform) => (
              <Card key={platform.name} className="bg-white/5">
                <CardContent className="flex items-start gap-4 pt-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/8">
                    <platform.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold">{platform.name}</h2>
                      <span className="rounded-full bg-white/8 px-2 py-1 text-xs font-semibold text-muted-foreground">
                        Coming soon
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{platform.detail}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/8 py-16">
        <div className="page-shell flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Already installed?</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal">Connect your desktop account.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Sign in on the web, then connect Privora Desktop to use hosted AI credits while keeping local workspace access inside the app.
            </p>
          </div>
          <a href="/desktop/connect" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full md:w-auto")}>
            <Laptop className="h-5 w-5" />
            Connect desktop
          </a>
        </div>
      </section>
    </>
  );
}
