/// <reference types="vite/client" />

import type { PrivoraDesktopApi } from "../shared/types";

declare global {
  interface Window {
    privoraDesktop: PrivoraDesktopApi;
  }
}
