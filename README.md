# Nexus AI Chat

A premium, highly-polished conversational AI interface powered by Google's Gemini models. Nexus AI is designed to feel like a native application with smooth animations, meticulous high-contrast themes, and a natural, engaging conversational AI personality.

## ✨ Features

* **Conversational Personality:** Tuned with a custom system prompt to be engaging, witty, and human-like via the official `@google/genai` Node SDK.
* **Intelligent "Thinking" Process:** View the model's internal reasoning process in a collapsible, beautifully animated "Thought Process" block complete with a shimmering loading state and markdown support.
* **Typing & Generating Indicators:** Custom animated 4-angle lotus wireframe typing indicator that seamlessly transitions into the model's response.
* **Image & Attachment Support:** Upload images to include in your prompt. The app handles base64 encoding and displays attachments beautifully before sending.
* **Instant Model Switching:** Seamlessly swap between Google's Gemini models and GPT-5.5 modes routed through CLIProxyAPI.
* **GPT-5.5 via CLIProxy:** Use `GPT-5.5 Instant` with `reasoning.effort: "none"` or `GPT-5.5 Thinking` with `reasoning.effort: "medium"` through an OpenAI Responses-compatible local proxy.
* **Real-time Streaming & Abort:** Watch responses generate in real-time. Change your mind? Hit the custom stop button to instantly sever the stream using an `AbortController`.
* **Smart Auto-expanding Input:** The message box grows naturally as you type or paste code, matching standard native messaging app behaviors.
* **Premium Theming:** Includes a beautiful ChatGPT-style High-Contrast Minimalist Dark Mode and a Calm Beige Light Mode, complete with adaptive monochrome icons.
* **Fluid Animations:** Powered by `motion` for buttery smooth layout transitions, pop-layouts, and sequence animations.

## 🚀 Tech Stack

* **React** (via Vite)
* **TypeScript**
* **Tailwind CSS** (for styling)
* **Motion** (for animations)
* **Lucide React** (for icons)
* **@google/genai** (Google GenAI SDK)
* **React Markdown** (with remark-gfm for Github Flavored Markdown)
* **CLIProxyAPI** (optional local OpenAI-compatible proxy for GPT-5.5)

## 🛠️ Setup & Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment setup:**
   Create a `.env` file in the root directory and add your Google Gemini API Key. 
   *(Note: The AI Studio environment injects `process.env.GEMINI_API_KEY` automatically. If running a standard Vite app locally, you might need to adjust this to `import.meta.env.VITE_GEMINI_API_KEY` inside `App.tsx` depending on your build setup, or run it through a Node backend.)*
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

   Optional CLIProxy/GPT-5.5 setup:
   ```env
   CLIPROXY_BASE_URL=http://127.0.0.1:8317
   VITE_CLIPROXY_API_KEY=sk-dummy
   ```

   Start CLIProxyAPI in another terminal:
   ```powershell
   cliproxy --config C:\Users\Thumbeja\config.yaml
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

## GPT-5.5 / CLIProxy Notes

The GPT path is separate from the Gemini path:

```text
src/lib/cliproxy/
```

The browser sends GPT requests to:

```text
/cliproxy/v1/responses
```

Vite proxies that to:

```text
http://127.0.0.1:8317/v1/responses
```

The two GPT-5.5 modes are:

* **GPT-5.5 Instant:** `reasoning.effort = "none"`
* **GPT-5.5 Thinking:** `reasoning.effort = "medium"`

OpenAI's official docs list `gpt-5.5` as supporting reasoning levels including `none` and `medium`, text and image input, text output, vision, and Responses API file inputs. See `docs/cliproxy-openai.md` for the exact implementation notes and caveats.

## 🎨 Design Philosophy
Every UI element in Nexus AI is crafted with intent. From abandoning default browser selection menus, to building custom SVG indicators and fine-tuning exact hex codes for dark mode contrast, Nexus is built to demonstrate how a simple LLM chat interface can feel like a high-end consumer product.
