import { useRef, type Dispatch, type FormEvent, type KeyboardEvent, type MutableRefObject, type SetStateAction } from "react";
import { getModelOption } from "../../../lib/models";
import { streamCliproxyResponse } from "../../../lib/cliproxy/responses";
import { generateGeminiTitle, streamGeminiResponse, toGeminiContents } from "../../../lib/gemini/client";
import { appLogger } from "../../../lib/logger";
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
  replaceChatMessages,
  updateChatMeta,
  type ChatMessageRecord,
  type ChatRecord,
  type PendingResearchIntentRecord,
  type ResearchActivityRecord,
  type ResearchPlanRecord,
  type ResearchPlanStepStatus,
} from "../../../lib/db";

type Message = ChatMessageRecord;
type Chat = ChatRecord;
type CurrentRef<T> = MutableRefObject<T> | { current: T };

interface UseChatGenerationOptions {
  input: string;
  messages: Message[];
  attachments: Attachment[];
  setInput: Dispatch<SetStateAction<string>>;
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
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
  messagesRef: CurrentRef<Message[]>;
  chatsRef: CurrentRef<Chat[]>;
  abortControllerRef: CurrentRef<AbortController | null>;
  shouldAutoScrollRef: CurrentRef<boolean>;
  textareaRef: CurrentRef<HTMLTextAreaElement | null>;
  isNearChatBottom: () => boolean;
}

export function useChatGeneration({
  input,
  messages,
  attachments,
  setInput,
  setAttachments,
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
  messagesRef,
  chatsRef,
  abortControllerRef,
  shouldAutoScrollRef,
  textareaRef,
  isNearChatBottom,
}: UseChatGenerationOptions) {
  const researchJobIdRef = useRef<string | null>(null);
  const editingResearchPlanMessageIdRef = useRef<string | null>(null);

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
      const newMessages = [...prev];
      const lastMsg = { ...newMessages[newMessages.length - 1] };
      if (lastMsg.role === "model") {
        newMessages[newMessages.length - 1] = { ...lastMsg, ...patch };
      }
      return newMessages;
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
    const requestModel = selectedModelRef.current;
    const requestProvider = getModelOption(requestModel)?.provider;
    const requestIsCliproxy = requestProvider === "cliproxy";
    const requestStyle = selectedStyleRef.current;
    const requestThinkingEnabled = isThinkingEnabledRef.current;
    const requestDeepResearchEnabled = isDeepResearchEnabledRef.current;
    const requestWebSearchEnabled = isWebSearchEnabledRef.current || requestDeepResearchEnabled;
    const systemInstruction = getSystemInstruction({
      styleId: requestStyle,
      provider: requestProvider,
      webSearchEnabled: requestWebSearchEnabled,
      deepResearchEnabled: requestDeepResearchEnabled,
    });

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

      try {
        await streamCliproxyResponse({
          model: requestModel,
          instructions: systemInstruction,
          history: newHistory,
          reasoningEffort: requestThinkingEnabled ? "medium" : "none",
          webSearchEnabled: requestWebSearchEnabled,
          signal: abortControllerRef.current.signal,
          onTextDelta: (delta) => {
            currentText += delta;
            updateLastModelMessage({ content: currentText });
          },
          onThoughtDelta: (delta) => {
            currentThought += delta;
            updateLastModelMessage({ thought: currentThought, isThinking: true });
          },
          onWebSearch: ({ status, queries }) => {
            const existingQueries = messagesRef.current[messagesRef.current.length - 1]?.webSearchQueries;
            updateLastModelMessage({ webSearchStatus: status, webSearchQueries: queries || existingQueries });
          },
        });

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
            content: currentText,
            thought: currentThought,
            isThinking: false,
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
        const errorMessage = "I could not reach CLIProxy at the moment. Make sure `cliproxy` is running on http://127.0.0.1:8317.";
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
      updateLastModelMessage({
        isThinking: false,
        webSearchStatus: finalWebSearchStatus,
        webSearchQueries: finalWebSearchStatus ? currentWebSearchQueries : undefined,
      });

      const currentChat = chatsRef.current.find(c => c.id === chatId);
      const finalMessages: Message[] = [
        ...newHistory,
        {
          ...pendingModelMessage,
          content: currentText,
          thought: currentThought,
          isThinking: false,
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

  const startResearchPlan = async (messageId: string) => {
    const chatId = currentChatIdRef.current;
    if (!chatId || isTypingRef.current) return;

    const currentMessages = messagesRef.current;
    const planIndex = currentMessages.findIndex(message => message.id === messageId);
    const planMessage = currentMessages[planIndex];
    const userMessage = currentMessages[planIndex - 1];
    if (!planMessage?.researchPlan || !userMessage || userMessage.role !== "user") return;

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
      const activeBonus = plan.steps.some(step => step.status === "active") ? 0.45 : 0;
      return Math.min(96, Math.round(((completed + activeBonus) / Math.max(1, plan.steps.length)) * 100));
    };
    const appendResearchActivity = (activity: ResearchActivityRecord) => {
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
          if (index < boundedIndex && step.status !== "skipped") return { ...step, status: "completed" as const };
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
    let fallbackProgressTimer: number | undefined;
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
      fallbackProgressTimer = window.setInterval(() => {
        if (currentResearchStatus === "completed" || currentResearchStatus === "stopped" || currentResearchStatus === "failed") return;
        const activeIndex = currentPlan.steps.findIndex(step => step.status === "active");
        const nextIndex = activeIndex < 0 ? 0 : Math.min(currentPlan.steps.length - 1, activeIndex + 1);
        if (activeIndex >= currentPlan.steps.length - 2) return;
        currentPlan = applyPlanStep(currentPlan, nextIndex, "active", currentPlan.steps[nextIndex]?.text || currentPlan.currentActivity);
        updateResearchMessage({ researchPlan: currentPlan });
      }, 9000);

      await streamResearchJob({
        jobId,
        signal: abortControllerRef.current.signal,
        onEvent: (event) => {
          if (event.type === "status") {
            currentResearchStatus = event.status;
            const statusStepIndex =
              event.status === "searching" ? Math.min(1, currentPlan.steps.length - 1) :
              event.status === "reading" ? Math.min(2, currentPlan.steps.length - 1) :
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
            currentPlan = { ...currentPlan, currentActivity: event.activity.title, updatedAt: Date.now() };
            updateResearchMessage({ researchActivity: currentActivity, researchPlan: currentPlan });
          }

          if (event.type === "planStep") {
            currentPlan = applyPlanStep(currentPlan, event.index, event.status, event.message);
            updateResearchMessage({ researchPlan: currentPlan });
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
      if (fallbackProgressTimer !== undefined) {
        window.clearInterval(fallbackProgressTimer);
      }
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
      const activeBonus = plan.steps.some(step => step.status === "active") ? 0.45 : 0;
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
          if (index < boundedIndex && step.status !== "skipped") return { ...step, status: "completed" as const };
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
          event.status === "searching" ? Math.min(1, currentPlan.steps.length - 1) :
          event.status === "reading" ? Math.min(2, currentPlan.steps.length - 1) :
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
        currentPlan = { ...currentPlan, currentActivity: event.activity.title, updatedAt: Date.now() };
        updateResearchMessage({ researchActivity: currentActivity, researchPlan: currentPlan });
      }

      if (event.type === "planStep") {
        currentPlan = applyPlanStep(currentPlan, event.index, event.status, event.message);
        updateResearchMessage({ researchPlan: currentPlan });
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
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const cancelResearchPlan = async (messageId: string) => {
    if (isTypingRef.current) return;
    const chatId = currentChatIdRef.current;
    if (!chatId) return;
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
      const nextMessages = currentMessages.map(message =>
        message.id === messageId
          ? {
              ...message,
              researchPlan: { ...nextPlan, status: "draft" as const },
              researchActivity: [
                ...(message.researchActivity || []),
                { phase: "planning", title: "Updated research plan", detail: text, timestamp: Date.now() },
              ],
            }
          : message
      );
      await persistMessagesSnapshot(chatId, nextMessages, { pendingResearchIntent: undefined });
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
    handleKeyDown,
    handleRetryMessage,
    startResearchPlan,
    resumeResearchJob,
    editResearchPlan,
    cancelResearchPlan,
    handleSubmit,
    stopGeneration,
  };
}
