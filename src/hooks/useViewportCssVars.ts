import { useEffect } from "react";

export function useViewportCssVars() {
  useEffect(() => {
    const updateViewportVars = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const keyboardInset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;

      document.documentElement.style.setProperty("--privora-app-height", `${height}px`);
      document.documentElement.style.setProperty("--privora-keyboard-inset", `${keyboardInset}px`);
    };

    updateViewportVars();
    window.visualViewport?.addEventListener("resize", updateViewportVars);
    window.visualViewport?.addEventListener("scroll", updateViewportVars);
    window.addEventListener("resize", updateViewportVars);
    window.addEventListener("orientationchange", updateViewportVars);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportVars);
      window.visualViewport?.removeEventListener("scroll", updateViewportVars);
      window.removeEventListener("resize", updateViewportVars);
      window.removeEventListener("orientationchange", updateViewportVars);
    };
  }, []);
}
