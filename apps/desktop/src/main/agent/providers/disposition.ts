import type { ProviderStreamOptions } from "./types";

// Only structured provider signals establish a refusal. Ordinary prose such as
// "I cannot connect" must not be mistaken for a safety decision.
export const emitChatDisposition = (options: ProviderStreamOptions, choice: any) => {
  const refusal = choice?.delta?.refusal ?? choice?.message?.refusal;
  if (typeof refusal === "string" && refusal) {
    options.onResponseDisposition?.("model_refusal");
    options.onTextDelta(refusal);
  }
  if (choice?.finish_reason === "content_filter") options.onResponseDisposition?.("provider_restriction");
};

export const emitResponsesDisposition = (options: ProviderStreamOptions, event: string | undefined, data: any) => {
  const type = data?.type || event;
  if (type === "response.refusal.delta" && typeof data?.delta === "string") {
    options.onResponseDisposition?.("model_refusal");
    options.onTextDelta(data.delta);
  }
  if (type === "response.content_part.added" && data?.part?.type === "refusal") options.onResponseDisposition?.("model_refusal");
  if (data?.response?.incomplete_details?.reason === "content_filter") options.onResponseDisposition?.("provider_restriction");
};
