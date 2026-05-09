import { useRef, type Dispatch, type FormEvent, type KeyboardEvent, type MutableRefObject, type SetStateAction } from "react";
import { getModelOption } from "../../../lib/models";
import { CLIPROXY_IMAGE_MODEL, streamCliproxyImage, type CliproxyImageResult } from "../../../lib/cliproxy/images";
import { generateCliproxyArtifactSummary, streamCliproxyResponse } from "../../../lib/cliproxy/responses";
import { generateGeminiTitle, streamGeminiResponse, toGeminiContents } from "../../../lib/gemini/client";
import { appLogger } from "../../../lib/logger";
import {
  ARTIFACT_SYSTEM_INSTRUCTION,
  detectArtifactFromMessage,
  deriveArtifactKind,
  getTitleFromContent,
  type ArtifactDraftPayload,
  type ArtifactPayload,
} from "../../../lib/artifacts";
import {
  getAttachmentTotalSize,
  normalizeAttachmentUrls,
  validateCliproxyAttachments,
  validateGeminiAttachments,
  type Attachment,
} from "../../../lib/attachments";
import { DEEP_RESEARCH_PREFLIGHT_INSTRUCTION, getSystemInstruction, type ResponseStyleId } from "../../../lib/prompt";
import { DEEP_RESEARCH_TIME_BUDGET_MS } from "../../../lib/prompt";
import { cancelResearchJob, getResearchJobSnapshot, runResearchPreflight, startResearchJob, streamResearchJob, type ResearchStreamEvent } from "../../../lib/research/client";
import {
  normalizeMessage,
  createId,
  replaceChatMessages,
  updateChatMeta,
  upsertArtifact,
  type ArtifactRecord,
  type ArtifactReferenceRecord,
  type ChatMessageRecord,
  type ChatRecord,
  type ImageGenerationItemRecord,
  type ImageGenerationOptionsRecord,
  type PendingResearchIntentRecord,
  type ResearchActivityRecord,
  type ResearchPlanRecord,
  type ResearchPlanStepStatus,
} from "../../../lib/db";
import type { ImageSettings } from "../../../lib/settings";

type Message = ChatMessageRecord;
type Chat = ChatRecord;
type CurrentRef<T> = MutableRefObject<T> | { current: T };

interface UseChatGenerationOptions {
  input: string;
  messages: Message[];
  attachments: Attachment[];
  composerMode: "chat" | "image";
  setInput: Dispatch<SetStateAction<string>>;
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  setComposerMode: Dispatch<SetStateAction<"chat" | "image">>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setIsTyping: Dispatch<SetStateAction<boolean>>;
  currentChatIdRef: CurrentRef<string | null>;
  isTypingRef: CurrentRef<boolean>;
  selectedModelRef: CurrentRef<string>;
  selectedStyleRef: CurrentRef<ResponseStyleId>;
  isThinkingEnabledRef: CurrentRef<boolean>;
  isWebSearchEnabledRef: CurrentRef<boolean>;
  isDeepResearchEnabledRef: CurrentRef<boolean>;
  imageSettingsRef: CurrentRef<ImageSettings>;
  messagesRef: CurrentRef<Message[]>;
  chatsRef: CurrentRef<Chat[]>;
  abortControllerRef: CurrentRef<AbortController | null>;
  shouldAutoScrollRef: CurrentRef<boolean>;
  textareaRef: CurrentRef<HTMLTextAreaElement | null>;
  isNearChatBottom: () => boolean;
  onArtifactUpsert?: (artifact: ArtifactRecord) => void;
  onArtifactOpen?: (artifactId: string) => void;
}

export function useChatGeneration({
  input,
  messages,
  attachments,
  composerMode,
  setInput,
  setAttachments,
  setComposerMode,
  setMessages,
  setChats,
  setIsTyping,
  currentChatIdRef,
  isTypingRef,
  selectedModelRef,
  selectedStyleRef,
  isThinkingEnabledRef,
  isWebSearchEnabledRef,
  isDeepResearchEnabledRef,
  imageSettingsRef,
  messagesRef,
  chatsRef,
  abortControllerRef,
  shouldAutoScrollRef,
  textareaRef,
  isNearChatBottom,
  onArtifactUpsert,
  onArtifactOpen,
}: UseChatGenerationOptions) {
  const researchJobIdRef = useRef<string | null>(null);
  const editingResearchPlanMessageIdRef = useRef<string | null>(null);
  const composerModeRef = useRef(composerMode);
  composerModeRef.current = composerMode;

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      appLogger.info("Generation stop requested");
      const activeResearchJobId = researchJobIdRef.current ||
        [...messagesRef.current].reverse().find(message => message.researchPlan?.status === "running" && message.researchJobId)?.researchJobId;
      if (activeResearchJobId) {
        void cancelResearchJob(activeResearchJobId);
        return;
      }
      abortControllerRef.current.abort();
      setIsTyping(false);
    }
  };

  const syncChatMessages = async (
    chatId: string,
    nextMessages: Message[],
    metaPatch: Partial<Pick<Chat, "title" | "pendingResearchIntent" | "updatedAt" | "model">> = {}
  ) => {
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === chatId
          ? {
              ...chat,
              ...metaPatch,
              messages: nextMessages,
              updatedAt: metaPatch.updatedAt || Date.now(),
            }
          : chat
      )
    );
    await replaceChatMessages(chatId, nextMessages, { ...metaPatch, updatedAt: metaPatch.updatedAt || Date.now() });
  };

  const syncCurrentChatMessages = async (
    nextMessages: Message[],
    metaPatch: Partial<Pick<Chat, "title" | "pendingResearchIntent" | "updatedAt" | "model">> = {}
  ) => {
    const chatId = currentChatIdRef.current;
    if (!chatId) return;
    await syncChatMessages(chatId, nextMessages, metaPatch);
  };

  const updateLastModelMessage = (patch: Partial<Message>) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const newMessages = [...prev];
      const lastMsg = { ...newMessages[newMessages.length - 1] };
      if (lastMsg.role === "model") {
        const hasChanges = Object.entries(patch).some(([key, value]) => lastMsg[key as keyof Message] !== value);
        if (!hasChanges) return prev;
        newMessages[newMessages.length - 1] = { ...lastMsg, ...patch };
        return newMessages;
      }
      return prev;
    });
  };

  const persistFinalGeneration = async (
    chatId: string,
    finalMessages: Message[],
    metaPatch: Partial<Pick<Chat, "title" | "pendingResearchIntent" | "updatedAt" | "model">> = {}
  ) => {
    setMessages(finalMessages);
    await syncChatMessages(chatId, finalMessages, metaPatch);
  };

  const persistArtifactFromPayload = async (
    chatId: string,
    messageId: string,
    payload: ArtifactPayload
  ): Promise<ArtifactReferenceRecord | null> => {
    const now = Date.now();
    const artifactId = payload.operation === "create" && payload.targetArtifactId
      ? payload.targetArtifactId
      : createId("artifact");
    const artifact: ArtifactRecord = {
      id: artifactId,
      chatId,
      messageId,
      kind: payload.kind,
      title: payload.title,
      language: payload.language,
      content: payload.content,
      status: "ready",
      createdAt: now,
      updatedAt: now,
    };
    await upsertArtifact(artifact);
    onArtifactUpsert?.(artifact);
    window.setTimeout(() => onArtifactOpen?.(artifactId), 0);
    return {
      artifactId,
      title: artifact.title,
      kind: artifact.kind,
      status: artifact.status,
    };
  };

  const formatPreflightClarification = (assistantMessage: string | undefined, questions: string[] | undefined) => {
    const cleanMessage = assistantMessage?.trim();
    const cleanQuestions = (questions || []).filter(question => question.trim().length > 0);
    if (cleanQuestions.length === 0) {
      return cleanMessage || "What should I focus on for the research?";
    }

    const questionList = cleanQuestions.map((question, index) => `${index + 1}. ${question}`).join("\n");
    return cleanMessage ? `${cleanMessage}\n\n${questionList}` : questionList;
  };

  const getFallbackTitle = (chatId: string, text: string) => {
    const currentChat = chatsRef.current.find(c => c.id === chatId);
    return currentChat?.title === "New Conversation"
      ? text.slice(0, 30) + (text.length > 30 ? "..." : "")
      : currentChat?.title;
  };

  const imageResultToAttachment = (
    image: CliproxyImageResult,
    mode: "generate" | "edit",
    prompt: string,
    completedAt = Date.now()
  ): Attachment => {
    const safePrompt = prompt
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image";
    const name = `privora-${mode}-${safePrompt}-${completedAt}.${image.outputFormat || "png"}`;
    return {
      base64: image.base64,
      mimeType: image.mimeType || "image/png",
      name,
      size: Math.ceil((image.base64.length * 3) / 4),
      url: `data:${image.mimeType || "image/png"};base64,${image.base64}`,
    };
  };

  const getImageSizeForPreset = (sizePreset: ImageSettings["sizePreset"]) => {
    if (sizePreset === "square_2k") return "2048x2048";
    if (sizePreset === "landscape") return "1536x1024";
    if (sizePreset === "widescreen") return "2048x1152";
    if (sizePreset === "widescreen_4k") return "3840x2160";
    if (sizePreset === "portrait") return "1024x1536";
    if (sizePreset === "story_4k") return "2160x3840";
    if (sizePreset === "auto") return "auto";
    return "1024x1024";
  };

  const isLargeImageSizePreset = (sizePreset: ImageSettings["sizePreset"]) =>
    sizePreset === "square_2k" ||
    sizePreset === "widescreen_4k" ||
    sizePreset === "story_4k" ||
    sizePreset === "auto";

  const getImageGenerationOptions = (): ImageGenerationOptionsRecord => {
    const settings = imageSettingsRef.current;
    const count = isLargeImageSizePreset(settings.sizePreset) ? 1 : settings.count;
    return {
      sizePreset: settings.sizePreset,
      size: getImageSizeForPreset(settings.sizePreset),
      quality: settings.quality,
      count,
      partialImages: settings.partialImages,
      outputFormat: settings.outputFormat,
    };
  };

  const shouldRunImageRequestsIndividually = (options: ImageGenerationOptionsRecord) =>
    options.count > 1 && isLargeImageSizePreset(options.sizePreset);

  const getCliproxyFailureMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/auth_unavailable|no auth available/i.test(message)) {
      return "The local AI connection is signed out for this model. Open CLIProxy, refresh/sign in, then retry.";
    }
    if (/disable-image-generation|image generation is disabled/i.test(message)) {
      return "Image generation is disabled in the local AI connection. Enable image generation there, then retry.";
    }
    return "I could not reach the local AI connection at the moment. Make sure CLIProxy is running on http://127.0.0.1:8317.";
  };

  const getImageGenerationFailureMessage = (error: unknown, options: ImageGenerationOptionsRecord) => {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/stream error|INTERNAL_ERROR|received from peer/i.test(message)) {
      return isLargeImageSizePreset(options.sizePreset)
        ? "The image stream dropped while creating a large image. Try the 1536x1024 or 1024x1536 size for a faster, steadier run."
        : "The image stream dropped before an image was returned. Try again in a moment.";
    }
    if (/auth_unavailable|no auth available/i.test(message)) {
      return "The local AI connection is signed out. Open CLIProxy, refresh/sign in, then retry.";
    }
    if (/disable-image-generation|image generation is disabled/i.test(message)) {
      return "Image generation is disabled in the local AI connection. Enable it there, then retry.";
    }
    return message || "Image generation failed. Try again in a moment.";
  };

  const getReadyResearchHistory = (history: Message[], displayedUserMessage: Message, refinedPrompt?: string) => {
    const prompt = refinedPrompt?.trim();
    if (!prompt) return history;

    return [
      ...history.slice(0, -1),
      {
        ...displayedUserMessage,
        content: prompt,
      },
    ];
  };

  const buildResearchPlan = (preflight: Awaited<ReturnType<typeof runResearchPreflight>>, fallbackTitle: string): ResearchPlanRecord => {
    const now = Date.now();
    const steps = (preflight.plan?.steps || [])
      .filter(step => step.trim().length > 0)
      .slice(0, 7)
      .map(text => ({ text, status: "pending" as const }));

    return {
      title: preflight.plan?.title || fallbackTitle || "Deep Research",
      steps: steps.length > 0 ? steps : [
        { text: "Collect authoritative sources.", status: "pending" },
        { text: "Compare the strongest available evidence.", status: "pending" },
        { text: "Check contradictions and stale information.", status: "pending" },
        { text: "Synthesize a cited answer.", status: "pending" },
      ],
      refinedPrompt: preflight.plan?.refinedPrompt || preflight.refinedPrompt || fallbackTitle,
      status: "draft",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
  };

  const updateMessageById = (messageId: string, updater: (message: Message) => Message) => {
    setMessages(prev => prev.map(message => message.id === messageId ? updater(message) : message));
  };

  const persistMessagesSnapshot = async (chatId: string, nextMessages: Message[], metaPatch: Partial<Pick<Chat, "title" | "pendingResearchIntent" | "updatedAt" | "model">> = {}) => {
    setMessages(nextMessages);
    await syncChatMessages(chatId, nextMessages, metaPatch);
  };

  const sendMessage = async (text: string, currentHistory: Message[], customAttachments?: Attachment[]) => {
    const chatId = currentChatIdRef.current;
    if (!chatId) return;

    if (isTypingRef.current) return;

    const currentAttachments = normalizeAttachmentUrls(customAttachments || attachments);
    if (!text && currentAttachments.length === 0) return;
    const requestComposerMode = composerModeRef.current;
    const requestIsImageMode = requestComposerMode === "image";
    const requestModel = selectedModelRef.current;
    const requestProvider = getModelOption(requestModel)?.provider;
    const requestIsCliproxy = requestProvider === "cliproxy";
    const requestStyle = selectedStyleRef.current;
    const requestThinkingEnabled = isThinkingEnabledRef.current;
    const requestDeepResearchEnabled = isDeepResearchEnabledRef.current;
    const requestWebSearchEnabled = isWebSearchEnabledRef.current || requestDeepResearchEnabled;
    const userDeclinedArtifacts = /\b(?:no|dont|don't|do not|skip|without|no need)\b.{0,32}\b(?:artifact|artifacts|canvas|file|files)\b/i.test(text) ||
      /\b(?:artifact|artifacts|canvas|file|files)\b.{0,32}\b(?:no|not|dont|don't|skip|unneeded)\b/i.test(text);
    const artifactRuntimeEnabled = !requestIsImageMode && !requestDeepResearchEnabled && !userDeclinedArtifacts;
    const baseSystemInstruction = getSystemInstruction({
      styleId: requestStyle,
      provider: requestProvider,
      webSearchEnabled: requestWebSearchEnabled,
      deepResearchEnabled: requestIsImageMode ? false : requestDeepResearchEnabled,
    });
    const systemInstruction = requestIsImageMode
      ? baseSystemInstruction
      : artifactRuntimeEnabled
        ? `${baseSystemInstruction}\n\n${ARTIFACT_SYSTEM_INSTRUCTION}`
        : `${baseSystemInstruction}\n\nThe user does not want a Canvas artifact for this turn. Answer normally and do not create or update artifacts.`;

    if (requestIsImageMode) {
      if (!text.trim()) {
        alert("Describe the image you want Privora to create or edit.");
        return;
      }

      const imageAttachments = currentAttachments.filter(attachment => attachment.mimeType.startsWith("image/"));
      if (currentAttachments.length !== imageAttachments.length) {
        alert("Image mode only supports image attachments for editing. Remove other files first.");
        return;
      }

      const imageMode: "generate" | "edit" = imageAttachments.length > 0 ? "edit" : "generate";
      const startedAt = Date.now();
      const imageOptions = getImageGenerationOptions();
      const imageItems: ImageGenerationItemRecord[] = Array.from({ length: imageOptions.count }, (_, index) => ({
        id: `${startedAt}-${index}`,
        status: "queued",
        outputFormat: imageOptions.outputFormat,
      }));
      appLogger.info("Image generation started", {
        chatId,
        mode: imageMode,
        model: CLIPROXY_IMAGE_MODEL,
        sourceImageCount: imageAttachments.length,
        imageCount: imageOptions.count,
        size: imageOptions.size,
        quality: imageOptions.quality,
        promptLength: text.length,
      });

      isTypingRef.current = true;
      setInput("");
      setAttachments([]);
      setIsTyping(true);
      shouldAutoScrollRef.current = isNearChatBottom();
      abortControllerRef.current = new AbortController();

      const userMessage = normalizeMessage(
        { role: "user", content: text, attachments: currentAttachments.length > 0 ? currentAttachments : undefined },
        chatId
      );
      const newHistory = [...currentHistory, userMessage];
      const pendingModelMessage = normalizeMessage(
        {
          role: "model",
          content: "",
          isThinking: false,
          imageGeneration: {
            status: "queued",
            mode: imageMode,
            prompt: text,
            model: CLIPROXY_IMAGE_MODEL,
            options: imageOptions,
            items: imageItems,
            startedAt,
            outputFormat: imageOptions.outputFormat,
          },
        },
        chatId,
        Date.now() + 1
      );
      const pendingMessages: Message[] = [...newHistory, pendingModelMessage];
      setMessages(pendingMessages);
      void syncChatMessages(chatId, pendingMessages).catch((error) => {
        appLogger.error("Pending image generation save failed", { err: error, chatId });
      });

      const completedAttachments: Array<Attachment | undefined> = Array.from({ length: imageOptions.count });
      let latestImageItems = imageItems;

      const updateImageGenerationMessage = (updater: (items: ImageGenerationItemRecord[]) => ImageGenerationItemRecord[], patch: Partial<Message["imageGeneration"]> = {}) => {
        updateMessageById(pendingModelMessage.id, message => {
          const previousGeneration = message.imageGeneration || pendingModelMessage.imageGeneration!;
          const previousItems = previousGeneration.items?.length ? previousGeneration.items : imageItems;
          const nextItems = updater(previousItems);
          latestImageItems = nextItems;
          return {
            ...message,
            imageGeneration: {
              ...previousGeneration,
              ...patch,
              items: nextItems,
            },
          };
        });
      };

      const updateImageItem = (index: number, patch: Partial<ImageGenerationItemRecord>, generationPatch: Partial<Message["imageGeneration"]> = {}) => {
        const safeIndex = Math.max(0, Math.min(imageOptions.count - 1, index));
        updateImageGenerationMessage(items =>
          items.map((item, itemIndex) => itemIndex === safeIndex ? { ...item, ...patch } : item),
          generationPatch
        );
      };

      const markQueuedItemsGenerating = () => {
        updateImageGenerationMessage(items =>
          items.map(item => item.status === "queued" ? { ...item, status: "generating" as const } : item),
          { status: "generating" }
        );
      };

      const runImageStream = async (count: 1 | 2 | 3 | 4, itemOffset = 0) => {
        const requestOptions = { ...imageOptions, count };
        await streamCliproxyImage({
          mode: imageMode,
          prompt: text,
          images: imageAttachments,
          options: requestOptions,
          signal: abortControllerRef.current!.signal,
          onPartialImage: (image, imageIndex) => {
            updateImageItem(itemOffset + imageIndex, {
              status: "generating",
              partialImageBase64: image.base64,
              outputFormat: image.outputFormat,
            }, { status: "generating", partialImageBase64: image.base64, outputFormat: image.outputFormat });
          },
          onCompletedImage: (image, imageIndex) => {
            const itemIndex = itemOffset + imageIndex;
            const completedAttachment = imageResultToAttachment(image, imageMode, text, Date.now() + itemIndex);
            completedAttachments[itemIndex] = completedAttachment;
            updateImageItem(itemIndex, {
              status: "completed",
              outputFormat: image.outputFormat,
              attachmentName: completedAttachment.name,
              completedAt: Date.now(),
            }, { status: "generating", outputFormat: image.outputFormat });
            updateMessageById(pendingModelMessage.id, message => ({
              ...message,
              attachments: completedAttachments.filter((attachment): attachment is Attachment => Boolean(attachment)),
            }));
          },
        });
      };

      const runParallelSingleImageStreams = async () => {
        await Promise.allSettled(
          Array.from({ length: imageOptions.count }, async (_, index) => {
            await runImageStream(1, index);
          })
        );
      };

      const runSequentialSingleImageStreams = async () => {
        for (let index = 0; index < imageOptions.count; index += 1) {
          if (abortControllerRef.current?.signal.aborted) break;
          await runImageStream(1, index);
        }
      };

      try {
        markQueuedItemsGenerating();
        if (imageMode === "edit" && imageOptions.count > 1) {
          await runParallelSingleImageStreams();
        } else if (shouldRunImageRequestsIndividually(imageOptions)) {
          await runSequentialSingleImageStreams();
        } else {
          try {
            await runImageStream(imageOptions.count);
          } catch (error: any) {
            const canFallbackToParallel =
              imageOptions.count > 1 &&
              completedAttachments.filter(Boolean).length === 0 &&
              !abortControllerRef.current?.signal.aborted &&
              /(\bn\b|multiple|unsupported|invalid|unknown parameter|unrecognized|not supported)/i.test(error?.message || "");
            if (!canFallbackToParallel) throw error;

            appLogger.warn("Image batch request failed, falling back to parallel single-image requests", {
              err: error,
              chatId,
              imageCount: imageOptions.count,
            });
            await runParallelSingleImageStreams();
          }
        }

        if (completedAttachments.filter(Boolean).length === 0 && imageOptions.count > 1 && !abortControllerRef.current?.signal.aborted) {
          appLogger.warn("Image batch returned no images, retrying as single-image requests", {
            chatId,
            imageCount: imageOptions.count,
            size: imageOptions.size,
          });
          await runSequentialSingleImageStreams();
        }

        if (completedAttachments.filter(Boolean).length === 0) {
          throw new Error("The local image generator finished without returning an image. Try a smaller size or try again.");
        }

        const completedAt = Date.now();
        const completedOutputFormat = completedAttachments.find(Boolean)?.mimeType === "image/webp"
          ? "webp"
          : completedAttachments.find(Boolean)?.mimeType === "image/jpeg"
            ? "jpeg"
            : "png";
        const finalImageGeneration = {
          ...pendingModelMessage.imageGeneration!,
          status: "completed" as const,
          completedAt,
          outputFormat: completedOutputFormat,
          items: latestImageItems.map((item, index) => ({
            ...item,
            status: completedAttachments[index] ? "completed" as const : "failed" as const,
            attachmentName: completedAttachments[index]?.name,
            completedAt: completedAttachments[index] ? completedAt : undefined,
            error: completedAttachments[index] ? undefined : "No image was returned for this slot.",
          })),
        };
        const currentChat = chatsRef.current.find(c => c.id === chatId);
        const title =
          currentChat?.title === "New Conversation"
            ? text.slice(0, 30) + (text.length > 30 ? "..." : "")
            : currentChat?.title;
        const finalMessages: Message[] = [
          ...newHistory,
          {
            ...pendingModelMessage,
            attachments: completedAttachments.filter((attachment): attachment is Attachment => Boolean(attachment)),
            imageGeneration: finalImageGeneration,
          },
        ];
        await persistFinalGeneration(chatId, finalMessages, title ? { title } : {});
        appLogger.info("Image generation completed", {
          chatId,
          mode: imageMode,
          model: CLIPROXY_IMAGE_MODEL,
          durationMs: completedAt - startedAt,
          imageCount: completedAttachments.filter(Boolean).length,
        });
      } catch (error: any) {
        const isStopped = error?.name === "AbortError" || abortControllerRef.current?.signal.aborted;
        const completedAt = Date.now();
        const finishedAttachments = completedAttachments.filter((attachment): attachment is Attachment => Boolean(attachment));
        const friendlyImageError = isStopped ? undefined : getImageGenerationFailureMessage(error, imageOptions);
        const finalMessages: Message[] = [
          ...newHistory,
          {
            ...pendingModelMessage,
            attachments: finishedAttachments.length > 0 ? finishedAttachments : undefined,
            imageGeneration: {
              ...pendingModelMessage.imageGeneration!,
              status: isStopped ? "stopped" : "failed",
              items: latestImageItems.map((item, index) => ({
                ...item,
                status: completedAttachments[index] ? "completed" as const : isStopped ? "stopped" as const : "failed" as const,
                attachmentName: completedAttachments[index]?.name,
                completedAt: completedAttachments[index] ? completedAt : undefined,
                error: completedAttachments[index] || isStopped ? undefined : friendlyImageError,
              })),
              completedAt,
              error: friendlyImageError,
            },
          },
        ];
        if (isStopped) {
          appLogger.info("Image generation stopped", {
            chatId,
            mode: imageMode,
            model: CLIPROXY_IMAGE_MODEL,
            durationMs: completedAt - startedAt,
          });
        } else {
          appLogger.error("Image generation failed", {
            err: error,
            chatId,
            mode: imageMode,
            model: CLIPROXY_IMAGE_MODEL,
            durationMs: completedAt - startedAt,
          });
        }
        await persistFinalGeneration(chatId, finalMessages);
      } finally {
        isTypingRef.current = false;
        setIsTyping(false);
        abortControllerRef.current = null;
      }

      return;
    }

    if (requestIsCliproxy) {
      const validationError = validateCliproxyAttachments(currentAttachments);
      if (validationError) {
        alert(validationError);
        return;
      }
    }

    if (requestProvider === "gemini") {
      const validationError = validateGeminiAttachments(currentAttachments);
      if (validationError) {
        alert(validationError);
        return;
      }
    }

    const startedAt = Date.now();
    appLogger.info("Generation started", {
      provider: requestProvider || "unknown",
      model: requestModel,
      chatId,
      attachmentCount: currentAttachments.length,
      attachmentTotalSize: getAttachmentTotalSize(currentAttachments),
      thinkingEnabled: requestThinkingEnabled,
      webSearchEnabled: requestWebSearchEnabled,
      deepResearchEnabled: requestDeepResearchEnabled,
      responseStyle: requestStyle,
      historyLength: currentHistory.length,
    });

    isTypingRef.current = true;
    setInput("");
    setAttachments([]);
    setIsTyping(true);
    shouldAutoScrollRef.current = isNearChatBottom();

    abortControllerRef.current = new AbortController();

    const userMessage = normalizeMessage(
      { role: "user", content: text, attachments: currentAttachments.length > 0 ? currentAttachments : undefined },
      chatId
    );
    const newHistory = [...currentHistory, userMessage];
    const pendingModelMessage = normalizeMessage(
      {
        role: "model",
        content: "",
        isThinking: requestDeepResearchEnabled ? true : requestThinkingEnabled,
      },
      chatId,
      Date.now() + 1
    );
    const pendingMessages: Message[] = [...newHistory, pendingModelMessage];
    setMessages(pendingMessages);
    if (!requestDeepResearchEnabled) {
      void syncChatMessages(chatId, pendingMessages).catch((error) => {
        appLogger.error("Pending chat save failed", { err: error, chatId });
      });
    }

    let streamingArtifactRef: ArtifactReferenceRecord | undefined;
    let didOpenStreamingArtifact = false;
    let lastStreamingArtifactLength = 0;
    let lastStreamingArtifactAt = 0;

    const upsertStreamingArtifactFromDraft = (draftPayload: ArtifactDraftPayload) => {
      if (!draftPayload.content.trim()) return;
      const now = Date.now();
      const shouldUpdate =
        !streamingArtifactRef ||
        draftPayload.content.length - lastStreamingArtifactLength >= 80 ||
        now - lastStreamingArtifactAt >= 250;
      if (!shouldUpdate) return;

      const artifactId = streamingArtifactRef?.artifactId || createId("artifact");
      const artifact: ArtifactRecord = {
        id: artifactId,
        chatId,
        messageId: pendingModelMessage.id,
        kind: draftPayload.kind,
        title: draftPayload.title,
        language: draftPayload.language,
        content: draftPayload.content,
        status: "streaming",
        createdAt: now,
        updatedAt: now,
      };
      const artifactRef: ArtifactReferenceRecord = {
        artifactId,
        title: artifact.title,
        kind: artifact.kind,
        status: "streaming",
      };
      streamingArtifactRef = artifactRef;
      lastStreamingArtifactLength = draftPayload.content.length;
      lastStreamingArtifactAt = now;
      onArtifactUpsert?.(artifact);
      updateLastModelMessage({ artifact: artifactRef });
      void upsertArtifact(artifact).catch((error) => {
        appLogger.warn("Streaming artifact draft save failed", { err: error, chatId, artifactId });
      });
      if (!didOpenStreamingArtifact) {
        didOpenStreamingArtifact = true;
        window.setTimeout(() => onArtifactOpen?.(artifactId), 0);
      }
    };

    const promoteStreamingArtifactPayload = (payload: ArtifactPayload): ArtifactPayload => {
      if (!streamingArtifactRef) return payload;
      return {
        ...payload,
        operation: "create",
        targetArtifactId: streamingArtifactRef.artifactId,
      };
    };

    const detectStreamingArtifactFromText = (value: string) => {
      const openFence = value.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*)$/);
      if (!openFence) return;
      const language = openFence[1] || undefined;
      const rawContent = openFence[2] || "";
      const closingFenceIndex = rawContent.indexOf("```");
      const content = (closingFenceIndex >= 0 ? rawContent.slice(0, closingFenceIndex) : rawContent).trim();
      if (content.length < 40) return;
      const kind = deriveArtifactKind(language, content);
      upsertStreamingArtifactFromDraft({
        operation: "create",
        kind,
        title: getTitleFromContent(content, kind),
        language,
        content,
      });
    };

    const removeArtifactBlocksFromChatText = (value: string) => {
      let cleaned = value.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, _language, blockContent) =>
        typeof blockContent === "string" && blockContent.trim().length >= 120 ? "" : match
      );
      if (/```([a-zA-Z0-9_-]*)\n[\s\S]*$/m.test(cleaned)) {
        cleaned = cleaned.replace(/\n?```([a-zA-Z0-9_-]*)\n[\s\S]*$/m, "");
      }
      return cleaned.replace(/\n{3,}/g, "\n\n").trim();
    };

    const getFallbackArtifactSummary = (operation: "create" | "update") =>
      operation === "update" ? "Done, updated in Canvas." : "Done, opened in Canvas.";

    const normalizeArtifactSummary = (value: string, operation: "create" | "update") => {
      const trimmed = value
        .replace(/\s+/g, " ")
        .replace(/^["'`]+|["'`]+$/g, "")
        .trim();
      if (!trimmed) return getFallbackArtifactSummary(operation);
      const sentenceEnd = trimmed.search(/[.!?](?:\s|$)/);
      const firstSentence = sentenceEnd >= 0 && sentenceEnd <= 180
        ? trimmed.slice(0, sentenceEnd + 1).trim()
        : trimmed.slice(0, 180).trim();
      return firstSentence || getFallbackArtifactSummary(operation);
    };

    const getArtifactCompletionText = (value: string, artifact?: ArtifactReferenceRecord) => {
      const cleaned = removeArtifactBlocksFromChatText(value);
      if (cleaned) return cleaned;
      if (artifact) return getFallbackArtifactSummary("create");
      return value;
    };

    const generateArtifactFinalText = async (
      artifact: ArtifactReferenceRecord,
      operation: "create" | "update"
    ) => {
      try {
        const summary = await generateCliproxyArtifactSummary({
          model: requestModel,
          userRequest: text,
          artifact,
          operation,
          signal: abortControllerRef.current!.signal,
        });
        return normalizeArtifactSummary(summary, operation);
      } catch (error) {
        appLogger.warn("Artifact summary finalizer failed", { err: error, chatId, artifactId: artifact.artifactId });
        return getFallbackArtifactSummary(operation);
      }
    };

    if (requestDeepResearchEnabled) {
      let currentText = "";
      let currentSources: Message["researchSources"] = [];
      let currentResearchStatus: Message["researchStatus"] = "queued";

      try {
        if (!requestProvider) {
          throw new Error("The selected model does not support Deep Research.");
        }

        const currentChat = chatsRef.current.find(c => c.id === chatId);
        const pendingIntent = currentChat?.pendingResearchIntent?.status === "awaiting_clarification"
          ? currentChat.pendingResearchIntent
          : undefined;
        const preflight = await runResearchPreflight({
          model: requestModel,
          provider: requestProvider,
          styleId: requestStyle,
          history: newHistory,
          pendingIntent,
          instruction: DEEP_RESEARCH_PREFLIGHT_INSTRUCTION,
        });

        if (preflight.decision !== "ready") {
          const now = Date.now();
          const nextIntent: PendingResearchIntentRecord | undefined = preflight.decision === "clarify"
            ? {
                status: "awaiting_clarification",
                originalGoal: pendingIntent?.originalGoal || text,
                clarificationQuestions: preflight.questions,
                userAnswers: pendingIntent ? [...(pendingIntent.userAnswers || []), text] : [],
                researchPlan: preflight.plan?.steps?.join("\n"),
                refinedPrompt: preflight.refinedPrompt,
                createdAt: pendingIntent?.createdAt || now,
                updatedAt: now,
              }
            : undefined;
          const responseContent = formatPreflightClarification(preflight.assistantMessage, preflight.questions);
          updateLastModelMessage({
            content: responseContent,
            isThinking: false,
            researchPreflight: preflight.decision === "clarify" ? "clarifying" : undefined,
          });
          const finalMessages: Message[] = [
            ...newHistory,
            {
              ...pendingModelMessage,
              content: responseContent,
              isThinking: false,
              researchPreflight: preflight.decision === "clarify" ? "clarifying" : undefined,
            },
          ];
          const title = getFallbackTitle(chatId, text);
          await persistFinalGeneration(chatId, finalMessages, {
            ...(title ? { title } : {}),
            pendingResearchIntent: nextIntent,
          });
          appLogger.info("Deep Research preflight completed without job", {
            chatId,
            model: requestModel,
            provider: requestProvider,
            decision: preflight.decision,
          });
          return;
        }

        const plan = buildResearchPlan(preflight, text);
        const planMessage: Message = {
          ...pendingModelMessage,
          content: "",
          isThinking: false,
          researchPlan: plan,
          researchActivity: [{
            phase: "planning",
            title: "Created research plan",
            detail: `${plan.steps.length} steps ready to review.`,
            timestamp: Date.now(),
          }],
          researchTimeBudgetMs: DEEP_RESEARCH_TIME_BUDGET_MS,
        };
        const title = getFallbackTitle(chatId, text);
        const finalMessages: Message[] = [
          ...newHistory,
          planMessage,
        ];
        await persistFinalGeneration(chatId, finalMessages, {
          ...(title ? { title } : {}),
          pendingResearchIntent: undefined,
        });
        appLogger.info("Deep Research plan created", {
          chatId,
          model: requestModel,
          provider: requestProvider,
          durationMs: Date.now() - startedAt,
        });
      } catch (error: any) {
        const isStopped = error?.name === "AbortError" || abortControllerRef.current?.signal.aborted;
        currentResearchStatus = isStopped ? "stopped" : "failed";
        const finalMessages: Message[] = [
          ...newHistory,
          {
            ...pendingModelMessage,
            content: isStopped ? currentText || "Generation stopped." : currentText || "Deep Research could not complete. Please try again in a moment.",
            isThinking: false,
            researchStatus: currentResearchStatus,
            researchSources: currentSources,
            researchCompletedAt: Date.now(),
            webSearchStatus: currentSources && currentSources.length > 0 ? "searched" : undefined,
          },
        ];
        if (isStopped) {
          appLogger.info("Deep Research stopped", { chatId, model: requestModel, durationMs: Date.now() - startedAt });
        } else {
          appLogger.error("Deep Research failed", { err: error, chatId, model: requestModel, durationMs: Date.now() - startedAt });
        }
        await persistFinalGeneration(chatId, finalMessages);
      } finally {
        researchJobIdRef.current = null;
        isTypingRef.current = false;
        setIsTyping(false);
        abortControllerRef.current = null;
      }

      return;
    }

    if (requestIsCliproxy) {
      let currentText = "";
      let currentThought = "";
      let currentArtifact: ArtifactReferenceRecord | undefined;
      let currentArtifactOperation: "create" | "update" = "create";
      const artifactTasks: Promise<void>[] = [];

      try {
        await streamCliproxyResponse({
          model: requestModel,
          instructions: systemInstruction,
          history: newHistory,
          reasoningEffort: requestThinkingEnabled ? "medium" : "none",
          webSearchEnabled: requestWebSearchEnabled,
          artifactToolsEnabled: artifactRuntimeEnabled,
          signal: abortControllerRef.current.signal,
          onTextDelta: (delta) => {
            currentText += delta;
            if (!streamingArtifactRef && !currentArtifact) {
              updateLastModelMessage({ content: currentText });
            }
          },
          onThoughtDelta: (delta) => {
            currentThought += delta;
            updateLastModelMessage({ thought: currentThought, isThinking: true });
          },
          onWebSearch: ({ status, queries }) => {
            const existingQueries = messagesRef.current[messagesRef.current.length - 1]?.webSearchQueries;
            updateLastModelMessage({ webSearchStatus: status, webSearchQueries: queries || existingQueries });
          },
          onArtifactToolDelta: (payload) => {
            if (!artifactRuntimeEnabled) return;
            if (payload.operation === "update") currentArtifactOperation = "update";
            upsertStreamingArtifactFromDraft(payload);
            updateLastModelMessage({ content: "" });
          },
          onArtifactToolCall: (payload) => {
            if (!artifactRuntimeEnabled) return;
            currentArtifactOperation = payload.operation;
            const task = persistArtifactFromPayload(chatId, pendingModelMessage.id, promoteStreamingArtifactPayload(payload)).then((artifactRef) => {
              if (!artifactRef) return;
              currentArtifact = artifactRef;
              updateLastModelMessage({ artifact: artifactRef, content: "" });
            });
            artifactTasks.push(task);
          },
        });
        await Promise.all(artifactTasks);

        if (!currentArtifact) {
          const detected = artifactRuntimeEnabled ? detectArtifactFromMessage(currentText) : null;
          if (detected) {
            currentArtifact = await persistArtifactFromPayload(chatId, pendingModelMessage.id, {
              ...detected,
              operation: "create",
              targetArtifactId: streamingArtifactRef?.artifactId,
            });
            if (currentArtifact) updateLastModelMessage({ artifact: currentArtifact, content: "" });
          }
        }

        const finalArtifactText = currentArtifact
          ? await generateArtifactFinalText(currentArtifact, currentArtifactOperation)
          : getArtifactCompletionText(currentText);
        updateLastModelMessage({ isThinking: false });

        const currentChat = chatsRef.current.find(c => c.id === chatId);
        const title =
          currentChat?.title === "New Conversation"
            ? text.slice(0, 30) + (text.length > 30 ? "..." : "")
            : currentChat?.title;
        const finalMessages: Message[] = [
          ...newHistory,
          {
            ...pendingModelMessage,
            content: finalArtifactText,
            thought: currentThought,
            isThinking: false,
            artifact: currentArtifact,
            webSearchStatus: messagesRef.current[messagesRef.current.length - 1]?.webSearchStatus,
            webSearchQueries: messagesRef.current[messagesRef.current.length - 1]?.webSearchQueries,
          },
        ];
        await persistFinalGeneration(chatId, finalMessages, title ? { title } : {});
        appLogger.info("CLIProxy generation completed", {
          chatId,
          model: requestModel,
          durationMs: Date.now() - startedAt,
          outputLength: currentText.length,
          thoughtLength: currentThought.length,
        });
      } catch (error: any) {
        const stoppedMessage = currentText || currentThought ? "" : "Generation stopped.";
        const errorMessage = getCliproxyFailureMessage(error);
        const finalMessages: Message[] = [
          ...newHistory,
          {
            ...pendingModelMessage,
            content: error?.name === "AbortError" || abortControllerRef.current?.signal.aborted ? currentText || stoppedMessage : currentText || errorMessage,
            thought: currentThought,
            isThinking: false,
            webSearchStatus: messagesRef.current[messagesRef.current.length - 1]?.webSearchStatus,
            webSearchQueries: messagesRef.current[messagesRef.current.length - 1]?.webSearchQueries,
          },
        ];
        if (error?.name === "AbortError" || abortControllerRef.current?.signal.aborted) {
          appLogger.info("CLIProxy generation stopped", {
            chatId,
            model: requestModel,
            durationMs: Date.now() - startedAt,
            outputLength: currentText.length,
            thoughtLength: currentThought.length,
          });
          await persistFinalGeneration(chatId, finalMessages);
        } else {
          appLogger.error("CLIProxy generation failed", {
            err: error,
            chatId,
            model: requestModel,
            durationMs: Date.now() - startedAt,
            outputLength: currentText.length,
            thoughtLength: currentThought.length,
          });
          await persistFinalGeneration(chatId, finalMessages);
        }
      } finally {
        isTypingRef.current = false;
        setIsTyping(false);
        abortControllerRef.current = null;
      }

      return;
    }

    let currentText = "";
    let currentThought = "";
    let currentWebSearchStatus: Message["webSearchStatus"];
    let currentWebSearchQueries: string[] | undefined;
    let didCompleteWebSearch = false;
    let currentArtifact: ArtifactReferenceRecord | undefined;

    try {
      const updateDisplayedGeminiMessage = () => {
        let displayText = currentText;
        let displayThought = currentThought;

        const thoughtRegex = /<thought>([\s\S]*?)(?:<\/thought>|$)/g;
        let match;
        while ((match = thoughtRegex.exec(displayText)) !== null) {
          displayThought += (displayThought ? "\n" : "") + match[1].trim();
        }

        displayText = displayText.replace(/<thought>([\s\S]*?)(?:<\/thought>|$)/g, "").trim();
        displayText = removeArtifactBlocksFromChatText(displayText);

        if (displayText || displayThought) {
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMsg = { ...newMessages[newMessages.length - 1] };
            if (lastMsg.role === "model") {
              lastMsg.content = displayText;
              lastMsg.thought = displayThought || lastMsg.thought;
              lastMsg.isThinking = Boolean(displayThought);
              lastMsg.webSearchStatus = currentWebSearchStatus;
              lastMsg.webSearchQueries = currentWebSearchQueries;
              newMessages[newMessages.length - 1] = lastMsg;
            }
            return newMessages;
          });
        }
      };

      await streamGeminiResponse({
        model: requestModel,
        contents: toGeminiContents(newHistory),
        systemInstruction,
        thinkingEnabled: requestThinkingEnabled,
        webSearchEnabled: requestWebSearchEnabled,
        signal: abortControllerRef.current.signal,
        onTextDelta: (delta) => {
          currentText += delta;
          if (artifactRuntimeEnabled) detectStreamingArtifactFromText(currentText);
          updateDisplayedGeminiMessage();
        },
        onThoughtDelta: (delta) => {
          currentThought += delta;
          updateDisplayedGeminiMessage();
        },
        onWebSearch: ({ queries }) => {
          currentWebSearchStatus = "searched";
          didCompleteWebSearch = true;
          currentWebSearchQueries = queries && queries.length > 0 ? queries : currentWebSearchQueries;
          updateLastModelMessage({ webSearchStatus: currentWebSearchStatus, webSearchQueries: currentWebSearchQueries });
        },
      });

      const finalWebSearchStatus = didCompleteWebSearch ? "searched" : undefined;
      const detectedArtifact = artifactRuntimeEnabled ? detectArtifactFromMessage(currentText) : null;
      if (detectedArtifact) {
        currentArtifact = await persistArtifactFromPayload(chatId, pendingModelMessage.id, {
          ...detectedArtifact,
          operation: "create",
          targetArtifactId: streamingArtifactRef?.artifactId,
        });
      }
      updateLastModelMessage({
        isThinking: false,
        artifact: currentArtifact,
        webSearchStatus: finalWebSearchStatus,
        webSearchQueries: finalWebSearchStatus ? currentWebSearchQueries : undefined,
      });

      const currentChat = chatsRef.current.find(c => c.id === chatId);
      const finalMessages: Message[] = [
        ...newHistory,
        {
          ...pendingModelMessage,
          content: getArtifactCompletionText(currentText, currentArtifact),
          thought: currentThought,
          isThinking: false,
          artifact: currentArtifact,
          webSearchStatus: finalWebSearchStatus,
          webSearchQueries: finalWebSearchStatus ? currentWebSearchQueries : undefined,
        },
      ];
      const fallbackTitle =
        currentChat?.title === "New Conversation"
          ? text.slice(0, 30) + (text.length > 30 ? "..." : "")
          : currentChat?.title;

      await persistFinalGeneration(chatId, finalMessages, fallbackTitle ? { title: fallbackTitle } : {});
      appLogger.info("Gemini generation completed", {
        chatId,
        model: requestModel,
        durationMs: Date.now() - startedAt,
        outputLength: currentText.length,
        thoughtLength: currentThought.length,
        webSearchCompleted: didCompleteWebSearch,
      });

      const isFirstMessage = currentChat?.title === "New Conversation";
      if (isFirstMessage) {
        generateGeminiTitle(
          "gemini-3.1-flash-lite-preview",
          `Summarize this conversation into a short, punchy title (max 5 words). Return ONLY the title text, no quotes, no extra formatting.\n\nConversation:\n${newHistory.map(m => m.role + ": " + m.content).join("\n")}\nmodel: ${currentText}`
        ).then(titleText => {
          const generatedTitle = titleText.replace(/["']/g, "").trim();
          if (generatedTitle) {
            setChats(prevChats => prevChats.map(c =>
              c.id === chatId ? { ...c, title: generatedTitle, updatedAt: Date.now() } : c
            ));
            updateChatMeta(chatId, { title: generatedTitle }).catch(err => appLogger.error("Failed to save generated title", { err, chatId }));
          }
        }).catch(err => appLogger.error("Failed to generate title", { err, chatId, model: "gemini-3.1-flash-lite-preview" }));
      }
    } catch (error: any) {
      const stoppedMessage = currentText || currentThought ? "" : "Generation stopped.";
      const errorMessage = "Whoops, lost my train of thought for a second there. (Error connecting)";
      const finalWebSearchStatus = didCompleteWebSearch ? "searched" : undefined;
      const finalMessages: Message[] = [
        ...newHistory,
        {
          ...pendingModelMessage,
          content: error?.name === "AbortError" || abortControllerRef.current?.signal.aborted ? currentText || stoppedMessage : currentText || errorMessage,
          thought: currentThought,
          isThinking: false,
          webSearchStatus: finalWebSearchStatus,
          webSearchQueries: finalWebSearchStatus ? currentWebSearchQueries : undefined,
        },
      ];
      if (error?.name === "AbortError" || abortControllerRef.current?.signal.aborted) {
        appLogger.info("Gemini generation stopped", {
          chatId,
          model: requestModel,
          durationMs: Date.now() - startedAt,
          outputLength: currentText.length,
          thoughtLength: currentThought.length,
          webSearchCompleted: didCompleteWebSearch,
        });
        await persistFinalGeneration(chatId, finalMessages);
      } else {
        appLogger.error("Gemini generation failed", {
          err: error,
          chatId,
          model: requestModel,
          durationMs: Date.now() - startedAt,
          outputLength: currentText.length,
          thoughtLength: currentThought.length,
          webSearchCompleted: didCompleteWebSearch,
        });
        await persistFinalGeneration(chatId, finalMessages);
      }
    } finally {
      isTypingRef.current = false;
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (isTypingRef.current) return;
    const currentMessages = messagesRef.current;
    const idx = currentMessages.findIndex(message => message.id === messageId);
    if (idx < 0) return;
    const msg = currentMessages[idx];
    if (msg.role !== "user") return;
    const trimmedMessages = currentMessages.slice(0, idx);

    setInput(msg.content);
    setAttachments(normalizeAttachmentUrls(msg.attachments || []));
    setMessages(trimmedMessages);
    await syncCurrentChatMessages(trimmedMessages);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(msg.content.length, msg.content.length);
    }, 0);
  };

  const handleEditGeneratedImage = (attachment: Attachment, prompt?: string) => {
    if (isTypingRef.current) return;
    composerModeRef.current = "image";
    setComposerMode("image");
    setAttachments([attachment]);
    setInput(prompt ? `Edit this image: ${prompt}` : "");
    window.setTimeout(() => {
      textareaRef.current?.focus();
      if (prompt) {
        const valueLength = textareaRef.current?.value.length || 0;
        textareaRef.current?.setSelectionRange(valueLength, valueLength);
      }
    }, 0);
  };

  const startResearchPlan = async (messageId: string) => {
    const chatId = currentChatIdRef.current;
    if (!chatId || isTypingRef.current) return;

    const currentMessages = messagesRef.current;
    const planIndex = currentMessages.findIndex(message => message.id === messageId);
    const planMessage = currentMessages[planIndex];
    const userMessage = currentMessages[planIndex - 1];
    if (!planMessage?.researchPlan || !userMessage || userMessage.role !== "user") return;

    if (editingResearchPlanMessageIdRef.current === messageId) {
      editingResearchPlanMessageIdRef.current = null;
      setInput("");
    }

    const requestModel = selectedModelRef.current;
    const requestProvider = getModelOption(requestModel)?.provider;
    const requestStyle = selectedStyleRef.current;
    if (!requestProvider) return;

    const systemInstruction = getSystemInstruction({
      styleId: requestStyle,
      provider: requestProvider,
      webSearchEnabled: true,
      deepResearchEnabled: true,
    });
    const startedAt = Date.now();
    let currentText = "";
    let currentSources: Message["researchSources"] = planMessage.researchSources || [];
    let currentResearchStatus: Message["researchStatus"] = "queued";
    const isBareSourceText = (value: string) => /^https?:\/\/\S+\s*$/.test(value.trim());
    let currentPlan: ResearchPlanRecord = {
      ...planMessage.researchPlan,
      status: "running",
      currentActivity: "Researching...",
      updatedAt: Date.now(),
      steps: planMessage.researchPlan.steps.map((step, index) => ({ ...step, status: index === 0 ? "active" : "pending" })),
    };
    const getPlanProgress = (plan: ResearchPlanRecord) => {
      const completed = plan.steps.filter(step => step.status === "completed").length;
      const activeBonus = plan.steps.some(step => step.status === "active") ? 0.18 : 0;
      return Math.min(96, Math.round(((completed + activeBonus) / Math.max(1, plan.steps.length)) * 100));
    };
    const appendResearchActivity = (activity: ResearchActivityRecord) => {
      if (activity.phase === "heartbeat") {
        let previousHeartbeatIndex = -1;
        for (let index = currentActivity.length - 1; index >= 0; index -= 1) {
          if (currentActivity[index].phase === "heartbeat") {
            previousHeartbeatIndex = index;
            break;
          }
        }
        if (previousHeartbeatIndex >= 0) {
          return currentActivity.map((item, index) => index === previousHeartbeatIndex ? activity : item);
        }
      }
      const last = currentActivity[currentActivity.length - 1];
      const isDuplicate = last &&
        last.phase === activity.phase &&
        last.title === activity.title &&
        last.detail === activity.detail &&
        last.source?.url === activity.source?.url;
      if (isDuplicate) return currentActivity;
      return [...currentActivity, activity];
    };
    const applyPlanStep = (
      plan: ResearchPlanRecord,
      targetIndex: number,
      status: ResearchPlanStepStatus,
      message?: string
    ): ResearchPlanRecord => {
      const boundedIndex = Math.max(0, Math.min(plan.steps.length - 1, targetIndex));
      const steps = plan.steps.map((step, index) => {
        if (status === "active") {
          if (index === boundedIndex) return { ...step, status: "active" as const };
          if (step.status === "active") return { ...step, status: "pending" as const };
          return step;
        }
        if (index === boundedIndex) return { ...step, status };
        return step;
      });
      const nextPlan = {
        ...plan,
        steps,
        currentActivity: message || plan.currentActivity,
        updatedAt: Date.now(),
      };
      return { ...nextPlan, progress: getPlanProgress(nextPlan) };
    };
    currentPlan = { ...currentPlan, progress: getPlanProgress(currentPlan) };
    let currentActivity: ResearchActivityRecord[] = [
      ...(planMessage.researchActivity || []),
    ];

    const updateResearchMessage = (patch: Partial<Message>) => {
      updateMessageById(messageId, message => ({ ...message, ...patch }));
    };

    isTypingRef.current = true;
    setIsTyping(true);
    abortControllerRef.current = new AbortController();
    updateResearchMessage({
      researchPlan: currentPlan,
      researchActivity: currentActivity,
      researchStatus: "queued",
      researchStartedAt: startedAt,
      researchTimeBudgetMs: DEEP_RESEARCH_TIME_BUDGET_MS,
      isThinking: false,
    });

    const researchHistory = getReadyResearchHistory(
      currentMessages.slice(0, planIndex),
      userMessage,
      currentPlan.refinedPrompt
    );

    try {
      const { jobId } = await startResearchJob({
        model: requestModel,
        provider: requestProvider,
        styleId: requestStyle,
        history: researchHistory,
        systemInstruction,
        timeBudgetMs: DEEP_RESEARCH_TIME_BUDGET_MS,
        plan: currentPlan,
      });
      researchJobIdRef.current = jobId;
      currentPlan = { ...currentPlan, status: "running", updatedAt: Date.now() };
      updateResearchMessage({ researchJobId: jobId, researchPlan: currentPlan });
      await persistMessagesSnapshot(
        chatId,
        messagesRef.current.map(message =>
          message.id === messageId
            ? { ...message, researchJobId: jobId, researchPlan: currentPlan, researchStatus: currentResearchStatus }
            : message
        ),
        { pendingResearchIntent: undefined }
      );
      await streamResearchJob({
        jobId,
        signal: abortControllerRef.current.signal,
        onEvent: (event) => {
          if (event.type === "status") {
            currentResearchStatus = event.status;
            const statusStepIndex =
              event.status === "searching" ? 0 :
              event.status === "reading" ? Math.min(1, currentPlan.steps.length - 1) :
              event.status === "synthesizing" ? currentPlan.steps.length - 1 :
              event.status === "queued" ? 0 :
              -1;
            currentPlan = statusStepIndex >= 0
              ? applyPlanStep(currentPlan, statusStepIndex, "active", event.message)
              : { ...currentPlan, currentActivity: event.message || currentPlan.currentActivity, updatedAt: Date.now() };
            updateResearchMessage({ researchStatus: event.status, researchPlan: currentPlan });
          }

          if (event.type === "activity") {
            currentActivity = appendResearchActivity(event.activity);
            currentPlan = event.activity.phase === "heartbeat" || event.activity.phase === "debug"
              ? currentPlan
              : { ...currentPlan, currentActivity: event.activity.title, updatedAt: Date.now() };
            updateResearchMessage({ researchActivity: currentActivity, researchPlan: currentPlan });
          }

          if (event.type === "planStep") {
            currentPlan = applyPlanStep(currentPlan, event.index, event.status, event.message);
            const stepText = currentPlan.steps[event.index]?.text || event.message;
            if (stepText && (event.status === "active" || event.status === "completed")) {
              currentActivity = appendResearchActivity({
                phase: event.status === "completed" ? "completed-step" : "step",
                title: event.status === "completed" ? "Finished research step" : "Working on research step",
                detail: stepText,
                timestamp: Date.now(),
              });
            }
            updateResearchMessage({ researchPlan: currentPlan, researchActivity: currentActivity });
          }

          if (event.type === "sources") {
            currentSources = event.sources;
            updateResearchMessage({ researchSources: currentSources });
          }

          if (event.type === "text") {
            currentText = event.text;
            updateResearchMessage({ content: currentText });
          }

          if (event.type === "completed") {
            currentText = event.text;
            currentSources = event.sources || currentSources;
            currentResearchStatus = "completed";
            currentPlan = {
              ...currentPlan,
              status: "completed",
              progress: 100,
              currentActivity: "Research complete",
              steps: currentPlan.steps.map(step => ({ ...step, status: step.status === "skipped" ? "skipped" : "completed" })),
              updatedAt: Date.now(),
            };
            updateResearchMessage({
              content: currentText,
              researchStatus: "completed",
              researchSources: currentSources,
              researchPlan: currentPlan,
              researchCompletedAt: Date.now(),
              isThinking: false,
            });
          }

          if (event.type === "stopped") {
            const stoppedText = event.text || currentText;
            currentText = stoppedText && !isBareSourceText(stoppedText) ? stoppedText : "Generation stopped.";
            currentSources = event.sources || currentSources;
            currentResearchStatus = "stopped";
            currentPlan = { ...currentPlan, status: "cancelled", currentActivity: "Research stopped", updatedAt: Date.now() };
            updateResearchMessage({
              content: currentText,
              researchStatus: "stopped",
              researchSources: currentSources,
              researchPlan: currentPlan,
              researchCompletedAt: Date.now(),
              isThinking: false,
            });
          }

          if (event.type === "error") {
            throw new Error(event.error);
          }
        },
      });
    } catch (error: any) {
      const isStopped = error?.name === "AbortError" || abortControllerRef.current?.signal.aborted;
      currentResearchStatus = isStopped ? "stopped" : "failed";
      currentPlan = { ...currentPlan, status: isStopped ? "cancelled" : "running", currentActivity: isStopped ? "Research stopped" : "Research failed", updatedAt: Date.now() };
      if (!isStopped) appLogger.error("Deep Research plan run failed", { err: error, chatId, model: requestModel });
    } finally {
      const latestMessages = messagesRef.current.map(message => {
        if (message.id !== messageId) return message;
        const finalContent = currentResearchStatus === "stopped" && (!currentText || isBareSourceText(currentText))
          ? "Generation stopped."
          : currentText || message.content || (currentResearchStatus === "stopped" ? "Generation stopped." : message.content);
        return {
          ...message,
          content: finalContent,
          researchStatus: currentResearchStatus,
          researchSources: currentSources,
          researchPlan: currentPlan,
          researchActivity: currentActivity,
          researchCompletedAt: currentResearchStatus === "completed" || currentResearchStatus === "stopped" || currentResearchStatus === "failed" ? Date.now() : message.researchCompletedAt,
          webSearchStatus: currentSources && currentSources.length > 0 ? "searched" as const : message.webSearchStatus,
          isThinking: false,
        };
      });
      await persistMessagesSnapshot(chatId, latestMessages, { pendingResearchIntent: undefined });
      researchJobIdRef.current = null;
      isTypingRef.current = false;
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const resumeResearchJob = async (messageId: string, jobId: string) => {
    const chatId = currentChatIdRef.current;
    if (!chatId || isTypingRef.current || researchJobIdRef.current === jobId) return;

    const currentMessages = messagesRef.current;
    const planMessage = currentMessages.find(message => message.id === messageId);
    if (!planMessage?.researchPlan || planMessage.researchPlan.status !== "running") return;

    try {
      await getResearchJobSnapshot(jobId);
    } catch (error) {
      appLogger.warn("Could not resume Deep Research job", { err: error, chatId, jobId });
      const nextMessages = messagesRef.current.map(message =>
        message.id === messageId && message.researchPlan
          ? {
              ...message,
              content: message.content || "This research job is no longer available. Start it again to continue.",
              researchStatus: "failed" as const,
              researchPlan: { ...message.researchPlan, status: "cancelled" as const, currentActivity: "Research unavailable", updatedAt: Date.now() },
              researchCompletedAt: Date.now(),
              isThinking: false,
            }
          : message
      );
      await persistMessagesSnapshot(chatId, nextMessages);
      return;
    }

    const isBareSourceText = (value: string) => /^https?:\/\/\S+\s*$/.test(value.trim());
    let currentText = planMessage.content || "";
    let currentSources: Message["researchSources"] = planMessage.researchSources || [];
    let currentResearchStatus: Message["researchStatus"] = planMessage.researchStatus || "queued";
    let currentPlan: ResearchPlanRecord = planMessage.researchPlan;
    let currentActivity: ResearchActivityRecord[] = planMessage.researchActivity || [];

    const getPlanProgress = (plan: ResearchPlanRecord) => {
      const completed = plan.steps.filter(step => step.status === "completed").length;
      const activeBonus = plan.steps.some(step => step.status === "active") ? 0.18 : 0;
      return Math.min(96, Math.round(((completed + activeBonus) / Math.max(1, plan.steps.length)) * 100));
    };
    const applyPlanStep = (
      plan: ResearchPlanRecord,
      targetIndex: number,
      status: ResearchPlanStepStatus,
      message?: string
    ): ResearchPlanRecord => {
      const boundedIndex = Math.max(0, Math.min(plan.steps.length - 1, targetIndex));
      const steps = plan.steps.map((step, index) => {
        if (status === "active") {
          if (index === boundedIndex) return { ...step, status: "active" as const };
          if (step.status === "active") return { ...step, status: "pending" as const };
          return step;
        }
        if (index === boundedIndex) return { ...step, status };
        return step;
      });
      const nextPlan = { ...plan, steps, currentActivity: message || plan.currentActivity, updatedAt: Date.now() };
      return { ...nextPlan, progress: getPlanProgress(nextPlan) };
    };
    const appendResearchActivity = (activity: ResearchActivityRecord) => {
      if (activity.phase === "heartbeat") {
        let previousHeartbeatIndex = -1;
        for (let index = currentActivity.length - 1; index >= 0; index -= 1) {
          if (currentActivity[index].phase === "heartbeat") {
            previousHeartbeatIndex = index;
            break;
          }
        }
        if (previousHeartbeatIndex >= 0) {
          return currentActivity.map((item, index) => index === previousHeartbeatIndex ? activity : item);
        }
      }
      const exists = currentActivity.some(item =>
        item.phase === activity.phase &&
        item.title === activity.title &&
        item.detail === activity.detail &&
        item.source?.url === activity.source?.url
      );
      if (exists) return currentActivity;
      return [...currentActivity, activity];
    };
    const updateResearchMessage = (patch: Partial<Message>) => {
      updateMessageById(messageId, message => ({ ...message, ...patch }));
    };
    const handleResearchEvent = (event: ResearchStreamEvent) => {
      if (event.type === "status") {
        currentResearchStatus = event.status;
        const statusStepIndex =
          event.status === "searching" ? 0 :
          event.status === "reading" ? Math.min(1, currentPlan.steps.length - 1) :
          event.status === "synthesizing" ? currentPlan.steps.length - 1 :
          event.status === "queued" ? 0 :
          -1;
        currentPlan = statusStepIndex >= 0
          ? applyPlanStep(currentPlan, statusStepIndex, "active", event.message)
          : { ...currentPlan, currentActivity: event.message || currentPlan.currentActivity, updatedAt: Date.now() };
        updateResearchMessage({ researchStatus: event.status, researchPlan: currentPlan });
      }

      if (event.type === "activity") {
        currentActivity = appendResearchActivity(event.activity);
        currentPlan = event.activity.phase === "heartbeat" || event.activity.phase === "debug"
          ? currentPlan
          : { ...currentPlan, currentActivity: event.activity.title, updatedAt: Date.now() };
        updateResearchMessage({ researchActivity: currentActivity, researchPlan: currentPlan });
      }

      if (event.type === "planStep") {
        currentPlan = applyPlanStep(currentPlan, event.index, event.status, event.message);
        const stepText = currentPlan.steps[event.index]?.text || event.message;
        if (stepText && (event.status === "active" || event.status === "completed")) {
          currentActivity = appendResearchActivity({
            phase: event.status === "completed" ? "completed-step" : "step",
            title: event.status === "completed" ? "Finished research step" : "Working on research step",
            detail: stepText,
            timestamp: Date.now(),
          });
        }
        updateResearchMessage({ researchPlan: currentPlan, researchActivity: currentActivity });
      }

      if (event.type === "sources") {
        currentSources = event.sources;
        updateResearchMessage({ researchSources: currentSources });
      }

      if (event.type === "text") {
        currentText = event.text;
        updateResearchMessage({ content: currentText });
      }

      if (event.type === "completed") {
        currentText = event.text;
        currentSources = event.sources || currentSources;
        currentResearchStatus = "completed";
        currentPlan = {
          ...currentPlan,
          status: "completed",
          progress: 100,
          currentActivity: "Research complete",
          steps: currentPlan.steps.map(step => ({ ...step, status: step.status === "skipped" ? "skipped" : "completed" })),
          updatedAt: Date.now(),
        };
        updateResearchMessage({
          content: currentText,
          researchStatus: "completed",
          researchSources: currentSources,
          researchPlan: currentPlan,
          researchCompletedAt: Date.now(),
          isThinking: false,
        });
      }

      if (event.type === "stopped") {
        const stoppedText = event.text || currentText;
        currentText = stoppedText && !isBareSourceText(stoppedText) ? stoppedText : "Generation stopped.";
        currentSources = event.sources || currentSources;
        currentResearchStatus = "stopped";
        currentPlan = { ...currentPlan, status: "cancelled", currentActivity: "Research stopped", updatedAt: Date.now() };
        updateResearchMessage({
          content: currentText,
          researchStatus: "stopped",
          researchSources: currentSources,
          researchPlan: currentPlan,
          researchCompletedAt: Date.now(),
          isThinking: false,
        });
      }

      if (event.type === "error") {
        throw new Error(event.error);
      }
    };

    researchJobIdRef.current = jobId;
    isTypingRef.current = true;
    setIsTyping(true);
    abortControllerRef.current = new AbortController();

    try {
      await streamResearchJob({
        jobId,
        signal: abortControllerRef.current.signal,
        onEvent: handleResearchEvent,
      });
    } catch (error: any) {
      const isStopped = error?.name === "AbortError" || abortControllerRef.current?.signal.aborted;
      if (!isStopped) {
        currentResearchStatus = "failed";
        currentPlan = { ...currentPlan, currentActivity: "Research failed", updatedAt: Date.now() };
        appLogger.error("Deep Research resume failed", { err: error, chatId, jobId });
      }
    } finally {
      const latestMessages = messagesRef.current.map(message => {
        if (message.id !== messageId) return message;
        const finalContent = currentResearchStatus === "stopped" && (!currentText || isBareSourceText(currentText))
          ? "Generation stopped."
          : currentText || message.content || (currentResearchStatus === "stopped" ? "Generation stopped." : message.content);
        return {
          ...message,
          content: finalContent,
          researchStatus: currentResearchStatus,
          researchSources: currentSources,
          researchPlan: currentPlan,
          researchActivity: currentActivity,
          researchJobId: jobId,
          researchCompletedAt: currentResearchStatus === "completed" || currentResearchStatus === "stopped" || currentResearchStatus === "failed" ? Date.now() : message.researchCompletedAt,
          webSearchStatus: currentSources && currentSources.length > 0 ? "searched" as const : message.webSearchStatus,
          isThinking: false,
        };
      });
      await persistMessagesSnapshot(chatId, latestMessages, { pendingResearchIntent: undefined });
      researchJobIdRef.current = null;
      isTypingRef.current = false;
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const editResearchPlan = (messageId: string) => {
    if (isTypingRef.current) return;
    const planMessage = messagesRef.current.find(message => message.id === messageId);
    if (!planMessage?.researchPlan || planMessage.researchPlan.status === "running") return;
    editingResearchPlanMessageIdRef.current = messageId;
    updateMessageById(messageId, message => ({
      ...message,
      researchPlan: message.researchPlan ? { ...message.researchPlan, status: "editing", updatedAt: Date.now() } : message.researchPlan,
    }));
    setInput("");
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ block: "nearest" });
    }, 0);
  };

  const clearResearchPlanEdit = (messageId?: string) => {
    const activeMessageId = editingResearchPlanMessageIdRef.current;
    if (messageId && activeMessageId && messageId !== activeMessageId) return;
    const targetMessageId = messageId || activeMessageId;
    editingResearchPlanMessageIdRef.current = null;
    setInput("");
    if (!targetMessageId) return;
    updateMessageById(targetMessageId, message => ({
      ...message,
      researchPlan: message.researchPlan?.status === "editing"
        ? { ...message.researchPlan, status: "draft", updatedAt: Date.now() }
        : message.researchPlan,
    }));
  };

  const cancelResearchPlan = async (messageId: string) => {
    if (isTypingRef.current) return;
    const chatId = currentChatIdRef.current;
    if (!chatId) return;
    if (editingResearchPlanMessageIdRef.current === messageId) {
      editingResearchPlanMessageIdRef.current = null;
      setInput("");
    }
    const nextMessages = messagesRef.current.map(message =>
      message.id === messageId && message.researchPlan
        ? { ...message, researchPlan: { ...message.researchPlan, status: "cancelled" as const, updatedAt: Date.now() } }
        : message
    );
    await persistMessagesSnapshot(chatId, nextMessages, { pendingResearchIntent: undefined });
  };

  const updateResearchPlanFromInput = async (text: string) => {
    const messageId = editingResearchPlanMessageIdRef.current;
    const chatId = currentChatIdRef.current;
    if (!messageId || !chatId) return false;
    const currentMessages = messagesRef.current;
    const planIndex = currentMessages.findIndex(message => message.id === messageId);
    const planMessage = currentMessages[planIndex];
    const userMessage = currentMessages[planIndex - 1];
    const requestModel = selectedModelRef.current;
    const requestProvider = getModelOption(requestModel)?.provider;
    if (!planMessage?.researchPlan || !userMessage || !requestProvider) return false;

    isTypingRef.current = true;
    setIsTyping(true);
    setInput("");
    abortControllerRef.current = new AbortController();

    const now = Date.now();
    const visibleAdjustmentMessage = normalizeMessage({
      role: "user",
      content: text,
      researchPlanReference: {
        title: planMessage.researchPlan.title,
        messageId,
      },
    }, chatId, now);
    const pendingUpdatedPlanMessage = normalizeMessage({
      role: "model",
      content: "I am updating the research plan.",
      isThinking: true,
      researchActivity: [
        { phase: "planning", title: "Updating research plan", detail: text, timestamp: now },
      ],
    }, chatId, now + 1);
    const supersededMessages = currentMessages.map(message =>
      message.id === messageId && message.researchPlan
        ? {
            ...message,
            researchPlan: {
              ...message.researchPlan,
              status: "superseded" as const,
              currentActivity: "Plan edited",
              updatedAt: now,
            },
          }
        : message
    );
    const pendingMessages = [...supersededMessages, visibleAdjustmentMessage, pendingUpdatedPlanMessage];
    await persistMessagesSnapshot(chatId, pendingMessages, { pendingResearchIntent: undefined });

    try {
      const adjustmentMessage = normalizeMessage({ role: "user", content: `Update this research plan: ${text}` }, chatId);
      const preflight = await runResearchPreflight({
        model: requestModel,
        provider: requestProvider,
        styleId: selectedStyleRef.current,
        history: [...currentMessages.slice(0, planIndex), adjustmentMessage],
        pendingIntent: {
          status: "awaiting_clarification",
          originalGoal: userMessage.content,
          researchPlan: planMessage.researchPlan.steps.map(step => step.text).join("\n"),
          refinedPrompt: planMessage.researchPlan.refinedPrompt,
          userAnswers: [text],
          createdAt: planMessage.researchPlan.createdAt,
          updatedAt: Date.now(),
        },
        instruction: DEEP_RESEARCH_PREFLIGHT_INSTRUCTION,
      });
      const nextPlan = buildResearchPlan(preflight, planMessage.researchPlan.title);
      const completedAt = Date.now();
      const nextMessages = messagesRef.current.map(message =>
        message.id === pendingUpdatedPlanMessage.id
          ? {
              ...message,
              content: preflight.assistantMessage || "",
              isThinking: false,
              researchPlan: { ...nextPlan, status: "draft" as const },
              researchActivity: [
                ...(planMessage.researchActivity || []),
                { phase: "planning", title: "Updated research plan", detail: text, timestamp: completedAt },
              ],
            }
          : message
      );
      await persistMessagesSnapshot(chatId, nextMessages, { pendingResearchIntent: undefined });
    } catch (error) {
      appLogger.error("Deep Research plan update failed", { err: error, chatId, model: requestModel });
      const failedMessages = messagesRef.current.map(message =>
        message.id === pendingUpdatedPlanMessage.id
          ? {
              ...message,
              content: "I couldn't update that research plan. Try a shorter adjustment.",
              isThinking: false,
            }
          : message
      );
      await persistMessagesSnapshot(chatId, failedMessages, { pendingResearchIntent: undefined });
    } finally {
      editingResearchPlanMessageIdRef.current = null;
      isTypingRef.current = false;
      setIsTyping(false);
      abortControllerRef.current = null;
    }

    return true;
  };

  const handleRetryMessage = async (messageId: string) => {
    if (isTypingRef.current) return;
    const currentMessages = messagesRef.current;
    const idx = currentMessages.findIndex(message => message.id === messageId);
    if (idx < 0) return;
    const msg = currentMessages[idx];
    if (msg.role === "user") {
      const previousMessages = currentMessages.slice(0, idx);
      await syncCurrentChatMessages(previousMessages);
      await sendMessage(msg.content, previousMessages, msg.attachments);
    } else if (msg.role === "model") {
      const prevMsg = currentMessages[idx - 1];
      if (prevMsg && prevMsg.role === "user") {
        const previousMessages = currentMessages.slice(0, idx - 1);
        if (msg.imageGeneration) {
          composerModeRef.current = "image";
          setComposerMode("image");
        }
        await syncCurrentChatMessages(previousMessages);
        await sendMessage(prevMsg.content, previousMessages, prevMsg.attachments);
      }
    }
  };

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (isTypingRef.current) return;

    if (editingResearchPlanMessageIdRef.current && text) {
      await updateResearchPlanFromInput(text);
      return;
    }

    await sendMessage(text, messages);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const isDesktopKeyboard = window.matchMedia("(pointer: fine)").matches;
    if (isDesktopKeyboard && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return {
    handleEditMessage,
    handleEditGeneratedImage,
    handleKeyDown,
    handleRetryMessage,
    startResearchPlan,
    resumeResearchJob,
    editResearchPlan,
    clearResearchPlanEdit,
    cancelResearchPlan,
    handleSubmit,
    stopGeneration,
  };
}
