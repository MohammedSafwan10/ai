import { useEffect, useState } from "react";
import {
  WINDOWS_DESKTOP_DOWNLOAD_URL,
  WINDOWS_DESKTOP_RELEASE_URL,
} from "@/lib/desktop-download";
type Release = {
  version: string;
  notes?: string;
  releaseDate?: string;
  sha256?: string;
  size?: number;
};
export function DownloadPage() {
  const [release, setRelease] = useState<Release | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    let live = true;
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch(WINDOWS_DESKTOP_RELEASE_URL, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error("Release unavailable");
        const v: unknown = await r.json();
        if (
          !v ||
          typeof v !== "object" ||
          !("version" in v) ||
          typeof v.version !== "string" ||
          !/^\d+\.\d+\.\d+$/.test(v.version)
        )
          throw Error("Invalid release");
        return {
          version: v.version,
          notes:
            "notes" in v && typeof v.notes === "string" ? v.notes : undefined,
          releaseDate:
            "releaseDate" in v && typeof v.releaseDate === "string"
              ? v.releaseDate
              : undefined,
          sha256:
            "sha256" in v && typeof v.sha256 === "string"
              ? v.sha256
              : undefined,
        } as Release;
      })
      .then((v) => {
        if (live) {
          setRelease(v);
          setState("ready");
        }
      })
      .catch(() => {
        if (live) setState("unavailable");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      live = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  return (
    <>
      <section className="download-hero shell">
        <div>
          <h1 className="reveal">
            Your next
            <br />
            workspace.
          </h1>
          <p className="reveal">
            Privora for Windows. Free to download, with your own model access.
          </p>
          <a
            className="button primary reveal"
            href={WINDOWS_DESKTOP_DOWNLOAD_URL}
          >
            Download for Windows x64
          </a>
          <p className="caption reveal">
            64-bit Intel or AMD · Windows 10 or later
          </p>
          <div className="release-status" role="status" aria-live="polite">
            {state === "loading" ? (
              <p>Checking the latest release…</p>
            ) : state === "ready" ? (
              <p>
                Stable release {release?.version}
                {release?.releaseDate &&
                !Number.isNaN(Date.parse(release.releaseDate))
                  ? ` · ${new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(release.releaseDate))}`
                  : ""}
              </p>
            ) : (
              <>
                <p>
                  Release details are temporarily unavailable. The download link
                  opens the stable Windows installer.
                </p>
                <button
                  className="text-link"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Check again
                </button>
              </>
            )}
          </div>
        </div>
        <figure className="download-product reveal">
          <img
            src="/media/download-pulse.webp"
            alt="Privora on a laptop, with a collapsed sidebar, project chat and a Pulse status page in the browser preview"
            width="1000"
            height="774"
          />
          <figcaption>Illustrative demo project in Privora.</figcaption>
        </figure>
      </section>
      <section className="setup-section shell">
        <h2 className="reveal">A short setup.</h2>
        <ol>
          <li className="reveal">
            <h3>Install the desktop.</h3>
            <p>
              Run the Windows installer and open Privora. Installed builds can
              check for desktop updates.
            </p>
            <div className="setup-visual">
              <img
                src="/media/project-start.png"
                alt="Privora project starters in the current desktop interface"
                width="1920"
                height="1032"
                loading="lazy"
              />
            </div>
          </li>
          <li className="reveal">
            <h3>Connect your model.</h3>
            <p>
              Add a supported provider’s key or endpoint in Settings. Provider
              usage charges and limits apply.
            </p>
            <div className="setup-visual setup-model">
              <img
                src="/media/desktop-demo.webp"
                alt="The desktop model selector and reasoning level in the composer"
                width="2031"
                height="774"
                loading="lazy"
              />
            </div>
          </li>
          <li className="reveal">
            <h3>Open a project.</h3>
            <p>
              Choose a folder, select your access mode, and give Privora a task.
            </p>
            <div className="setup-visual setup-files">
              <img
                src="/media/workspace-files.png"
                alt="A local README opened beside the conversation"
                width="1920"
                height="1032"
                loading="lazy"
              />
            </div>
          </li>
        </ol>
        <p className="reveal">
          Public installers currently target Windows x64. macOS and Linux
          downloads are not available here.
        </p>
      </section>
      {release?.notes && (
        <section className="release-notes shell">
          <h2>Release notes.</h2>
          <p>{release.notes}</p>
          {release.sha256 && /^[a-f\d]{64}$/i.test(release.sha256) && (
            <details>
              <summary>Installer SHA-256</summary>
              <code>{release.sha256}</code>
            </details>
          )}
        </section>
      )}
      <section className="download-proof shell">
        <img
          src="/media/desktop-demo.webp"
          alt="Privora desktop with an illustrative conversation and browser preview"
          width="2031"
          height="774"
        />
        <p className="caption">
          Illustrative demo conversation. Your model selection is up to you.
        </p>
      </section>
    </>
  );
}
