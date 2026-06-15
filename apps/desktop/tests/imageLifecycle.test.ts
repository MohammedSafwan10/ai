import { describe, expect, it } from "vitest";
import { buildRuntimeContext } from "../src/main/agent/context";
import {
  hasSuccessfulImageToolResult,
  isImageGenerationToolName,
  shouldCompleteAfterSuccessfulImageStall,
  userRequestedPostImageWork,
} from "../src/main/agent/turnCoordinator";
import type { DesktopToolCall, ToolEventRecord } from "../src/shared/types";

const imageCall = (name: "generate_image" | "edit_image", id = "call-image"): DesktopToolCall => ({
  id,
  name,
  arguments: {
    provider: "cliproxy",
    model: "gpt-image-2",
    prompt: "A tiny robot painting a sunset",
  },
});

describe("image generation lifecycle runtime helpers", () => {
  it("recognizes native image tools", () => {
    expect(isImageGenerationToolName("generate_image")).toBe(true);
    expect(isImageGenerationToolName("edit_image")).toBe(true);
    expect(isImageGenerationToolName("save_generated_image")).toBe(false);
  });

  it("tracks successful image results without requiring an early stop", () => {
    const results: Array<{ call: DesktopToolCall; result: { success: boolean; output?: string; data?: Record<string, unknown> } }> = [
      {
        call: imageCall("generate_image"),
        result: {
          success: true,
          data: {
            images: [{
              id: "img-1",
              path: "C:\\Users\\Test\\AppData\\Roaming\\Privora Dev\\generated-images\\img.png",
            }],
          },
        },
      },
      {
        call: { id: "call-save", name: "save_generated_image", arguments: { id: "img-1", destinationPath: "public/hero.png" } },
        result: { success: true, output: "Saved public/hero.png" },
      },
    ];

    expect(hasSuccessfulImageToolResult(results)).toBe(true);
    expect(results.every((item) => isImageGenerationToolName(item.call.name))).toBe(false);
  });

  it("only completes a stalled provider call after a successful image when no new progress arrived", () => {
    expect(shouldCompleteAfterSuccessfulImageStall({
      hasSuccessfulImageAwaitingFollowup: true,
      providerProducedProgress: false,
    })).toBe(true);
    expect(shouldCompleteAfterSuccessfulImageStall({
      hasSuccessfulImageAwaitingFollowup: true,
      providerProducedProgress: false,
      userRequestedPostImageWork: true,
    })).toBe(false);
    expect(shouldCompleteAfterSuccessfulImageStall({
      hasSuccessfulImageAwaitingFollowup: true,
      providerProducedProgress: true,
    })).toBe(false);
    expect(shouldCompleteAfterSuccessfulImageStall({
      hasSuccessfulImageAwaitingFollowup: false,
      providerProducedProgress: false,
    })).toBe(false);
  });

  it("detects image prompts that need follow-up tools or reporting", () => {
    expect(userRequestedPostImageWork([{
      role: "user",
      content: "Generate an image then save it to public/hero.png and verify the file size.",
      parts: [{ type: "text", text: "Generate an image then save it to public/hero.png and verify the file size." }],
    }])).toBe(true);
    expect(userRequestedPostImageWork([{
      role: "user",
      content: "Generate a cute robot image.",
      parts: [{ type: "text", text: "Generate a cute robot image." }],
    }])).toBe(false);
  });
});

describe("generated image runtime context", () => {
  it("adds a quiet path hint for later save/rename work", () => {
    const imagePath = "C:\\Users\\Test\\AppData\\Roaming\\Privora Dev\\generated-images\\img-1.png";
    const recentTool: ToolEventRecord = {
      id: "tool-1",
      threadId: "thread-1",
      messageId: "message-1",
      callId: "call-image",
      name: "generate_image",
      title: "Generate image",
      status: "done",
      risk: "safe",
      args: {},
      result: {
        success: true,
        data: {
          images: [{
            id: "img-1",
            path: imagePath,
            provider: "cliproxy",
            model: "gpt-image-2",
          }],
        },
      },
      output: imagePath,
      createdAt: 1,
      updatedAt: 1,
    };
    const store = {
      getThread: () => ({ id: "thread-1", title: "Image task", titleSource: "agent" }),
      listRecentToolEvents: () => [recentTool],
    };

    const context = buildRuntimeContext(store as never, "thread-1", process.cwd());

    expect(context).toContain("Generated images are saved under");
    expect(context).toContain("save_generated_image");
    expect(context).toContain("img-1");
    expect(context).toContain(imagePath);
  });
});
