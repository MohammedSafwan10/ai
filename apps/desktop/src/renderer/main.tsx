import React from "react";
import { createRoot } from "react-dom/client";
import "./monacoEnvironment";
import App from "./App";
import { RendererErrorBoundary } from "./RendererErrorBoundary";
import "./styles.css";
import { installRendererPerformanceDiagnostics } from "./performanceDiagnostics";

installRendererPerformanceDiagnostics(window.privoraDesktop.debugEnabled);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RendererErrorBoundary><App /></RendererErrorBoundary>
  </React.StrictMode>,
);
