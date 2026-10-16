import { z } from "zod";

export interface GoAccountSummary {
  id: string;
  name: string;
  issue?: { kind: "usage_limit" | "invalid_key"; model: string; at: number };
}
export interface GoAccountVault {
  activeId: string | null;
  accounts: (GoAccountSummary & { apiKey: string })[];
}
export const goAccountActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string().min(1).max(80).optional(), name: z.string().trim().min(1).max(60), apiKey: z.string().trim().min(1).max(10_000).optional() }).strict(),
  z.object({ action: z.literal("activate"), id: z.string().min(1).max(80) }).strict(),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(80) }).strict(),
]);
export type GoAccountAction = z.infer<typeof goAccountActionSchema>;

export const goAccountVaultSchema = z.object({
  activeId: z.string().nullable(),
  accounts: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1).max(60), apiKey: z.string().min(1),
    issue: z.object({ kind: z.enum(["usage_limit", "invalid_key"]), model: z.string(), at: z.number() }).optional(),
  })).max(10),
}).refine((vault) => new Set(vault.accounts.map((account) => account.id)).size === vault.accounts.length
  && (vault.activeId === null || vault.accounts.some((account) => account.id === vault.activeId)));

export function applyGoAccountAction(vault: GoAccountVault, input: GoAccountAction, newId: () => string): GoAccountVault {
  const action = goAccountActionSchema.parse(input);
  const accounts = vault.accounts.map((account) => ({ ...account }));
  const current = action.id ? accounts.find((account) => account.id === action.id) : undefined;
  if (action.id && !current) throw new Error("Go account no longer exists. Refresh settings and try again.");
  if (action.action === "activate") return { accounts, activeId: action.id };
  if (action.action === "remove") return { accounts: accounts.filter((account) => account.id !== action.id), activeId: vault.activeId === action.id ? null : vault.activeId };
  if (!current && accounts.length >= 10) throw new Error("You can save up to 10 Go accounts.");
  if (!current && !action.apiKey) throw new Error("Paste an API key to add a Go account.");
  if (action.apiKey && accounts.some((account) => account.id !== current?.id && account.apiKey === action.apiKey)) throw new Error("This API key is already saved under another account.");
  if (current) {
    current.name = action.name;
    if (action.apiKey) { current.apiKey = action.apiKey; delete current.issue; }
    return { accounts, activeId: vault.activeId };
  }
  const id = newId();
  accounts.push({ id, name: action.name, apiKey: action.apiKey! });
  return { accounts, activeId: vault.accounts.length ? vault.activeId : id };
}
