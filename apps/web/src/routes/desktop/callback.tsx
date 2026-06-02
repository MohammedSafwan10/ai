import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/desktop/callback")({
  component: DesktopCallbackPage,
});

function DesktopCallbackPage() {
  return (
    <section className="page-shell flex min-h-[calc(100svh-8rem)] items-center justify-center py-16">
      <Card className="w-full max-w-lg bg-white/5">
        <CardHeader>
          <CardTitle>Desktop callback</CardTitle>
          <CardDescription>This route is kept as a browser fallback. The production callback target is privora://auth/callback.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          If the desktop app did not open, install or update Privora Desktop, then reconnect from the app.
        </CardContent>
      </Card>
    </section>
  );
}
