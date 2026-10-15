import { z } from "zod";
import { reportCheckLabels } from "../../shared/securityWorkspace";

const check = z.object({ notes: z.string().max(8000), jobIds: z.array(z.string().trim().min(1).max(100)).max(30) }).strict();
export const reportReviewInputSchema = z.object({
  status: z.enum(["draft", "ready_for_review"]),
  checks: z.object(Object.fromEntries(Object.keys(reportCheckLabels).map((key) => [key, check])) as Record<keyof typeof reportCheckLabels, typeof check>).strict(),
  unresolved: z.array(z.string().trim().min(1).max(2000)).max(30),
  reportJobId: z.string().max(100),
  reportArtifactId: z.string().max(200),
}).strict();
