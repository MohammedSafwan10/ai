import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import App from "./App";

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
});

const chatDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$chatId",
});

const webDevRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/web-dev",
});

const webDevDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/web-dev/$projectId",
});

const webDevThreadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/web-dev/$projectId/thread/$threadId",
});

const charactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters",
});

const charactersLibraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters/library",
});

const characterSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters/$sessionId",
});

const webContainerConnectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/webcontainer/connect/$",
});

const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  chatRoute,
  chatDetailRoute,
  webDevRoute,
  webDevDetailRoute,
  webDevThreadRoute,
  charactersRoute,
  charactersLibraryRoute,
  characterSessionRoute,
  webContainerConnectRoute,
  catchAllRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
