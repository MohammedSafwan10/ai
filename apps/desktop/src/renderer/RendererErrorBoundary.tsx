import { Component, type ErrorInfo, type ReactNode } from "react";

export class RendererErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Privora interface failed", error.message, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main style={{ maxWidth: 540, margin: "12vh auto", padding: 28, fontFamily: "system-ui", color: "var(--privora-text, #ddd)", lineHeight: 1.6 }} role="alert">
      <h1 style={{ fontSize: 22 }}>Privora’s interface encountered an error</h1>
      <p>Background work may still be running. Reload the interface to reconnect and check its status before retrying any task.</p>
      <button type="button" onClick={() => window.location.reload()}>Reload interface</button>
      <p>Reloading does not request cancellation or replay of agent jobs. Recent interface errors are recorded in Privora’s local renderer-errors.log for diagnosis.</p>
    </main>;
  }
}
