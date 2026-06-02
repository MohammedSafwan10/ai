import { executePrivoraGateway } from "../../billing/creditService";
import { createAppwriteJwt } from "../../billing/appwriteAuth";
import { openRouterDesktopTools, parseDesktopToolCall } from "../tools/definitions";
import type { ProviderAdapter, ProviderMessage, ProviderStreamOptions } from "./types";
import { normalizeProviderUsage } from "./usage";

const toMessages = (systemInstruction: string, messages: ProviderMessage[]) => {
  const out: Array<Record<string, unknown>> = systemInstruction ? [{ role: "system", content: systemInstruction }] : [];
  messages.forEach((message) => {
    const parts = message.parts || [];
    const functionCalls = parts.filter((part) => part.type === "function_call");
    const functionResponses = parts.filter((part) => part.type === "function_response");
    const textParts = parts.filter((part) => part.type === "text");
    const imageParts = parts.filter((part) => part.type === "image");

    if (functionCalls.length > 0) {
      out.push({
        role: "assistant",
        content: message.content || "",
        tool_calls: functionCalls.map((part) => ({
          id: part.id,
          type: "function",
          function: {
            name: part.name,
            arguments: JSON.stringify(part.arguments || {}),
          },
        })),
      });
      return;
    }

    if (functionResponses.length > 0) {
      functionResponses.forEach((part) => {
        out.push({
          role: "tool",
          tool_call_id: part.id,
          name: part.name,
          content: JSON.stringify(part.response || {}),
        });
      });
      return;
    }

    if (message.role === "user" && imageParts.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      const text = message.content || textParts.map((part) => part.text).join("\n") || "";
      if (text) content.push({ type: "text", text });
      imageParts.forEach((part) => {
        content.push({
          type: "image_url",
          image_url: { url: `data:${part.mimeType};base64,${part.data}` },
        });
      });
      out.push({ role: message.role, content });
      return;
    }

    out.push({ role: message.role, content: message.content || "" });
  });
  return out;
};

export class PrivoraCloudAdapter implements ProviderAdapter {
  async stream(options: ProviderStreamOptions): Promise<void> {
    const gatewaySettings = {
      appwriteEndpoint: options.appwriteEndpoint,
      appwriteProjectId: options.appwriteProjectId,
      privoraGatewayFunctionId: options.privoraGatewayFunctionId,
    };
    const jwt = options.privoraUserJwt.trim() || await createAppwriteJwt(gatewaySettings, options.privoraSessionCookie);
    const result = await executePrivoraGateway<{
      text?: string;
      reasoning?: string;
      toolCalls?: Array<{ id?: string; name?: string; arguments?: string | Record<string, unknown> }>;
      usage?: unknown;
      billing?: { creditsUsed: number; estimatedCredits: number };
      summary?: any;
    }>(
      gatewaySettings,
      jwt,
      {
        action: "chat",
        model: options.model,
        messages: toMessages(options.systemInstruction, options.messages),
        tools: openRouterDesktopTools(options.collaborationMode),
        toolChoice: "auto",
        maxOutputTokens: options.maxOutputTokens,
        reasoning: options.reasoning,
      },
      options.signal,
    );

    if (typeof result.reasoning === "string" && result.reasoning) options.onThoughtDelta(result.reasoning);
    if (typeof result.text === "string" && result.text) options.onTextDelta(result.text);
    const usage = normalizeProviderUsage(result.usage);
    if (usage) options.onUsage?.(usage);
    result.toolCalls?.forEach((toolCall) => {
      const args = typeof toolCall.arguments === "string" ? toolCall.arguments : JSON.stringify(toolCall.arguments || {});
      const parsed = parseDesktopToolCall(toolCall.name, args, toolCall.id);
      if (parsed) options.onToolCall(parsed);
    });
    if (result.billing) options.onAiCredits?.({
      creditsUsed: result.billing.creditsUsed,
      estimatedCredits: result.billing.estimatedCredits,
      summary: result.summary,
    });
  }
}
