import { redirect } from "@tanstack/react-router";
import { z } from "zod";
import { account, isAppwriteConfigured } from "@/lib/appwrite";

export const authRedirectSchema = z.object({
  redirect: z.string().max(512).optional(),
});

export const authRecoverySchema = authRedirectSchema.extend({
  email: z.string().max(320).optional(),
});

export const authSecretSchema = z.object({
  userId: z.string().min(1).optional(),
  secret: z.string().min(1).optional(),
  redirect: z.string().max(512).optional(),
});

export const safeRedirect = (value: string | undefined) => (value?.startsWith("/") && !value.startsWith("//") ? value : "/account");

export const isUnauthenticatedAppwriteError = (error: unknown) => {
  const candidate = error as { code?: unknown; message?: unknown; type?: unknown };
  const code = typeof candidate.code === "number" ? candidate.code : 0;
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  const type = typeof candidate.type === "string" ? candidate.type.toLowerCase() : "";

  return (
    code === 401 ||
    type.includes("unauthorized") ||
    message.includes("missing scopes") ||
    message.includes("role: guests") ||
    message.includes("not authorized") ||
    message.includes("not authenticated")
  );
};

export async function clearCurrentSessionIfAny() {
  if (!isAppwriteConfigured) return;
  try {
    await account.deleteSession({ sessionId: "current" });
  } catch {
    // Nothing to clear, or the current session is already unusable.
  }
}

export async function continueIfAlreadySignedIn(redirectTo: string | undefined) {
  if (!isAppwriteConfigured) return false;
  try {
    await account.get();
    window.location.assign(safeRedirect(redirectTo));
    return true;
  } catch (error) {
    if (isUnauthenticatedAppwriteError(error)) await clearCurrentSessionIfAny();
    return false;
  }
}

export async function requireAdmin() {
  if (typeof window === "undefined" || !isAppwriteConfigured) {
    throw redirect({ to: "/auth/sign-in", search: { redirect: "/admin" } });
  }

  const user = await account.get();
  const labels = Array.isArray((user as { labels?: unknown }).labels) ? ((user as { labels: string[] }).labels) : [];

  if (!labels.includes("admin")) {
    throw redirect({ to: "/account" });
  }

  return { user };
}
