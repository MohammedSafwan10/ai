export type PlanId = "free" | "plus" | "pro";

export const AI_CREDIT_POLICY =
  "AI credits are consumed based on model, input size, output size, and tool usage. Premium models consume credits faster. BYOK usage does not consume Privora AI credits.";

export const plans = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    cadence: "forever",
    credits: "BYOK only",
    description: "Use Privora with your own model keys and local workspace harness.",
    cta: "Start free",
    featured: false,
    features: ["Bring your own API keys", "Local workspace agent harness", "Desktop updates", "Community launch support"],
  },
  {
    id: "plus",
    name: "Plus",
    price: "₹799",
    cadence: "per month",
    credits: "5,000 AI credits",
    description: "Hosted Privora models for steady personal use, plus BYOK fallback.",
    cta: "Choose Plus",
    featured: true,
    features: ["5,000 monthly AI credits", "BYOK included", "Usage and credit history", "Desktop account sync"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹1,999",
    cadence: "per month",
    credits: "20,000 AI credits",
    description: "Higher credit pool for heavier coding, research, and multi-tool work.",
    cta: "Choose Pro",
    featured: false,
    features: ["20,000 monthly AI credits", "BYOK included", "Higher hosted usage ceiling", "Priority product feedback lane"],
  },
] as const;

export const creditFacts = [
  "BYOK consumes 0 Privora AI credits.",
  "Free users can sign in and use Privora with their own keys.",
  "Hosted AI access requires Plus or Pro credits.",
  "No unlimited hosted AI. Caps protect users and Privora from surprise spend.",
];
