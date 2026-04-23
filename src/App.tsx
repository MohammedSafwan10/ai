import { useState, useRef, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { Send, Loader2, Plus, Moon, Sun, Square, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "./components/ChatMessage";

// Initialize the API only once outside the component
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are an incredibly engaging, empathetic, and human-like conversational partner. 
Crucial Rules:
1. DO NOT sound like a typical AI or virtual assistant. (e.g., skip phrases like "How can I help you today?", "As an AI...", "I understand...").
2. Use natural phrasing, occasional mild conversational fillers (like "hmm," "well," "to be honest"), and contractions. 
3. Show warmth, humor, and curiosity. React emotionally to what the user says.
4. Have opinions, preferences, and a distinct personality. Express your thoughts genuinely.
5. Keep answers concise, snappy, and conversational unless a deeper dive is explicitly requested. Do not write essays.
6. Don't constantly ask follow-up questions at the end of every single message unless it makes natural conversational sense.
7. Treat this like texting a good, articulate friend.
8. Smartly and naturally use emojis in your responses to convey emotion and tone, just like a real person would.`;

export default function App() {
  const [messages, setMessages] = useState<{ role: "user" | "model"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedModel, setSelectedModel] = useState("gemini-3.1-flash-lite-preview");
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);
  
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  
  // We keep a reference to the chat session to maintain history automatically through the SDK.
  const chatSessionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize chat session on mount
    chatSessionRef.current = ai.chats.create({
      model: "gemini-3.1-flash-lite-preview",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.85, // Slightly higher for more creative/human-like tangents
      },
    });
  }, []);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleNewChat = () => {
    setMessages([]);
    chatSessionRef.current = ai.chats.create({
      model: selectedModel,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.85,
      },
    });
  };

  useEffect(() => {
    // If the model changes and there are no messages, just swap the model instance seamlessly.
    // Otherwise, we could start a new chat if needed, but let's just make it new chat to be safe.
    handleNewChat();
  }, [selectedModel]);

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      // DO NOT set it to null here, otherwise it won't break the loop checking for aborted status
      setIsTyping(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || !chatSessionRef.current || isTyping) return;

    setInput("");
    setIsTyping(true);
    
    abortControllerRef.current = new AbortController();

    // Add user message to UI immediately
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    
    // Create an empty model message to stream into
    setMessages((prev) => [...prev, { role: "model", content: "" }]);

    try {
      const responseStream = await chatSessionRef.current.sendMessageStream({ message: text });
      let currentText = "";
      
      for await (const chunk of responseStream) {
        if (abortControllerRef.current?.signal.aborted) {
           break;
        }
        if (chunk.text) {
          currentText += chunk.text;
          
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg.role === "model") {
              lastMsg.content = currentText;
            }
            return newMessages;
          });
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        console.log("Generation stopped by user");
      } else {
        console.error("Error generating response:", error);
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === "model" && !lastMsg.content) {
               lastMsg.content = "Whoops, lost my train of thought for a second there. (Error connecting)";
          }
          return newMessages;
        });
      }
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="relative h-[100dvh] w-full flex flex-col font-sans bg-[var(--nexus-bg)] text-[var(--nexus-text)] overflow-hidden transition-colors duration-500">
      {/* Header */}
      <header className="absolute top-0 w-full z-10 p-6 shrink-0 flex items-center justify-between pointer-events-none transition-colors duration-500">
         <h1 className="text-xl font-display font-medium tracking-tight text-[var(--nexus-text)] opacity-90 pointer-events-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--nexus-accent)] animate-pulse"></span>
            Nexus AI
         </h1>
         <button 
           onClick={() => setIsDarkMode(!isDarkMode)}
           className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--nexus-muted)] hover:bg-[var(--nexus-text)]/5 hover:text-[var(--nexus-text)] transition-colors pointer-events-auto"
           aria-label="Toggle theme"
         >
           {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
         </button>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 pt-16 pb-40">
        <div className="max-w-[46rem] mx-auto flex flex-col justify-end min-h-full">
          {messages.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }}
              className="w-full mx-auto px-4 md:px-6 mb-6 mt-[20vh]"
            >
              <div className="flex flex-col items-start w-full text-[var(--nexus-text)]">
                <div className="prose max-w-none text-inherit prose-p:m-0 prose-p:leading-[1.75] prose-p:font-display prose-p:text-[1.1rem]">
                  <p>Hey! How's it going? What can I help you with today?</p>
                </div>
              </div>
            </motion.div>
          ) : (
            messages.map((msg, idx) => (
              <ChatMessage 
                key={idx} 
                role={msg.role} 
                content={msg.content} 
                isTyping={isTyping && idx === messages.length - 1}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="absolute bottom-0 w-full px-4 pb-4 md:pb-6 pt-12 bg-gradient-to-t from-[var(--nexus-bg)] via-[var(--nexus-bg)] via-80% to-transparent pointer-events-none transition-colors duration-500">
        <div className="max-w-[46rem] mx-auto relative pointer-events-auto">
          <form 
            onSubmit={handleSubmit}
            className="flex flex-col bg-[var(--nexus-surface)] rounded-[24px] border border-[var(--nexus-border)] shadow-[var(--nexus-shadow)] focus-within:border-[var(--nexus-muted)] focus-within:shadow-xl transition-all"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Nexus..."
              className="w-full max-h-48 min-h-[56px] text-[15px] bg-transparent text-[var(--nexus-text)] placeholder-[var(--nexus-muted)] px-4 pt-4 outline-none resize-none leading-relaxed transition-colors duration-500 overflow-y-auto"
              rows={1}
            />
            <div className="flex items-center justify-between px-3 py-3">
              <button
                type="button"
                className="p-1.5 rounded-full text-[var(--nexus-muted)] hover:bg-[var(--nexus-text)]/5 hover:text-[var(--nexus-text)] transition-colors"
                title="Add attachment (visually only for now)"
              >
                <Plus className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1.5 relative">
                 <button
                   type="button"
                   onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                   className="text-[var(--nexus-muted)] text-[13px] px-2 py-1.5 flex items-center gap-1.5 font-sans cursor-pointer hover:bg-[var(--nexus-text)]/5 hover:text-[var(--nexus-text)] rounded-md transition-colors"
                   title="Select AI Model"
                 >
                   {selectedModel === "gemini-3-flash-preview" ? "Nexus Core v3 (Flash)" : "Nexus Core v3.1 (Flash Lite)"}
                   <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                 </button>
                 
                 <AnimatePresence>
                   {isModelDropdownOpen && (
                     <>
                       <div 
                         className="fixed inset-0 z-40" 
                         onClick={() => setIsModelDropdownOpen(false)}
                       />
                       <motion.div 
                         initial={{ opacity: 0, y: 10, scale: 0.95 }}
                         animate={{ opacity: 1, y: 0, scale: 1 }}
                         exit={{ opacity: 0, y: 10, scale: 0.95 }}
                         transition={{ duration: 0.15 }}
                         className="absolute bottom-full left-0 mb-2 w-56 flex flex-col bg-[var(--nexus-bg)] rounded-xl border border-[var(--nexus-border)] shadow-xl z-50 overflow-hidden"
                       >
                         <button 
                           type="button"
                           onClick={() => { setSelectedModel("gemini-3-flash-preview"); setIsModelDropdownOpen(false); }}
                           className={`text-left px-4 py-3 text-[13px] font-sans hover:bg-[var(--nexus-surface)] transition-colors ${selectedModel === "gemini-3-flash-preview" ? "text-[var(--nexus-accent)] font-medium" : "text-[var(--nexus-text)]"}`}
                         >
                           Nexus Core v3 (Flash)
                         </button>
                         <button 
                           type="button"
                           onClick={() => { setSelectedModel("gemini-3.1-flash-lite-preview"); setIsModelDropdownOpen(false); }}
                           className={`text-left px-4 py-3 text-[13px] font-sans hover:bg-[var(--nexus-surface)] transition-colors ${selectedModel === "gemini-3.1-flash-lite-preview" ? "text-[var(--nexus-accent)] font-medium" : "text-[var(--nexus-text)]"}`}
                         >
                           Nexus Core v3.1 (Flash Lite)
                         </button>
                       </motion.div>
                     </>
                   )}
                 </AnimatePresence>


                 <AnimatePresence mode="popLayout">
                   {isTyping ? (
                     <motion.button
                       key="stop"
                       initial={{ scale: 0.5, opacity: 0 }}
                       animate={{ scale: 1, opacity: 1 }}
                       exit={{ scale: 0.5, opacity: 0 }}
                       type="button"
                       onClick={stopGeneration}
                       title="Stop generating"
                       className="shrink-0 ml-1 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--nexus-text)]/10 text-[var(--nexus-text)] hover:bg-[var(--nexus-text)]/20 transition-all border border-[var(--nexus-text)]/10"
                     >
                       <Square className="w-3.5 h-3.5 fill-current" />
                     </motion.button>
                   ) : (
                     <motion.button
                       key="send"
                       initial={{ scale: 0.5, opacity: 0 }}
                       animate={{ scale: 1, opacity: 1 }}
                       exit={{ scale: 0.5, opacity: 0 }}
                       type="submit"
                       disabled={!input.trim()}
                       className="shrink-0 ml-1 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--nexus-accent)] text-[var(--nexus-accent-fg)] hover:bg-[var(--nexus-accent-hover)] shadow-md disabled:shadow-none disabled:opacity-30 disabled:bg-[var(--nexus-text)]/10 disabled:text-[var(--nexus-muted)] transition-all"
                     >
                       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="translate-x-[0.5px]">
                          <path d="M12 19V5" />
                          <path d="M5 12l7-7 7 7" />
                       </svg>
                     </motion.button>
                   )}
                 </AnimatePresence>
              </div>
            </div>
          </form>
          <div className="text-center mt-2 flex items-center justify-center gap-4">
             <p className="text-[11px] text-[var(--nexus-muted)] opacity-70 transition-colors">
               Nexus is AI and can make mistakes. Please double-check responses.
             </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
