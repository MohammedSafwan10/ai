import { useLayoutEffect, useRef } from "react";

/** DOM stacking cannot cover Electron WebContentsViews. Suppress native views
 * independently of tab visibility, so agent navigation cannot reveal them. */
export function useBrowserOcclusion(forced: boolean) {
  const lastSent = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    const sync = () => {
      const modal = [...document.querySelectorAll('dialog[open], [aria-modal="true"], .settings-screen-layer')]
        .some((element) => element.getClientRects().length > 0);
      const occluded = forced || modal;
      if (lastSent.current === occluded) return;
      lastSent.current = occluded;
      void window.privoraDesktop.setBrowserOccluded(occluded).catch((error) => {
        lastSent.current = null;
        console.error("Could not update native browser overlay visibility", error);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "aria-modal", "hidden", "style"] });
    return () => observer.disconnect();
  }, [forced]);
}
