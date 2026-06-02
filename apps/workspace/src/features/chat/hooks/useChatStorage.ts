import { useEffect } from "react";
import { appLogger } from "../../../lib/logger";
import { normalizeChatAttachmentUrls } from "../../../lib/attachments";
import {
  loadChats,
  migrateLocalStorageChats,
  type ChatMessageRecord,
  type ChatRecord,
} from "../../../lib/db";

interface UseChatStorageOptions {
  setChats: (chats: ChatRecord[]) => void;
  setMessages: (messages: ChatMessageRecord[]) => void;
  setCurrentChatId: (chatId: string) => void;
  setIsStorageReady: (isReady: boolean) => void;
}

export function useChatStorage({
  setChats,
  setMessages,
  setCurrentChatId,
  setIsStorageReady,
}: UseChatStorageOptions) {
  useEffect(() => {
    let isMounted = true;

    const initializeStorage = async () => {
      try {
        await migrateLocalStorageChats();
        const storedChats = (await loadChats()).map(normalizeChatAttachmentUrls);

        if (!isMounted) return;

        setChats(storedChats);
        appLogger.info("Chat storage initialized", { chatCount: storedChats.length });
        if (storedChats.length > 0) {
          setCurrentChatId(storedChats[0].id);
          setMessages(storedChats[0].messages);
        }
      } catch (error) {
        appLogger.error("Failed to load local chat database", { err: error });
      } finally {
        if (isMounted) {
          setIsStorageReady(true);
        }
      }
    };

    initializeStorage();

    return () => {
      isMounted = false;
    };
  }, [setChats, setMessages, setCurrentChatId, setIsStorageReady]);
}
