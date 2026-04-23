# Nexus AI Chat

A premium, highly-polished conversational AI interface powered by Google's Gemini models. Nexus AI is designed to feel like a native application with smooth animations, meticulous high-contrast themes, and a natural, engaging conversational AI personality.

![Nexus AI Header](https://via.placeholder.com/800x200/212121/ECECEC?text=Nexus+AI)

## ✨ Features

* **Conversational Personality:** Tuned with a custom system prompt to be engaging, witty, and human-like via the official `@google/genai` Node SDK.
* **Instant Model Switching:** Seamlessly swap between Google's bleeding-edge models (`gemini-3-flash-preview` and `gemini-3.1-flash-lite-preview`) using a completely custom animated dropdown.
* **Real-time Streaming & Abort:** Watch responses generate in real-time. Change your mind? Hit the custom stop button to instantly sever the stream using an `AbortController`.
* **Smart Auto-expanding Input:** The message box grows naturally as you type or paste code, matching standard native messaging app behaviors.
* **Premium Theming:** Includes a beautiful ChatGPT-style High-Contrast Minimalist Dark Mode and a Calm Beige Light Mode, complete with adaptive monochrome icons.
* **Fluid Animations:** Powered by `framer-motion` for buttery smooth layout transitions, pop-layouts, and presence animations.

## 🚀 Tech Stack

* **React** (via Vite)
* **TypeScript**
* **Tailwind CSS** (for styling)
* **Motion / Framer Motion** (for animations)
* **Lucide React** (for icons)
* **@google/genai** (Google GenAI SDK)

## 🛠️ Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd <your-repo-directory>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment setup:**
   Create a `.env` file in the root directory and add your Google Gemini API Key. 
   *(Note: The AI Studio environment injects `process.env.GEMINI_API_KEY` automatically. If running a standard Vite app locally, you might need to adjust this to `import.meta.env.VITE_GEMINI_API_KEY` inside `App.tsx` depending on your build setup, or run it through a Node backend.)*
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

## 🎨 Design Philosophy
Every UI element in Nexus AI is crafted with intent. From abandoning default browser selection menus, to building custom SVG icons and fine-tuning exact hex codes for dark mode contrast, Nexus is built to demonstrate how a simple LLM chat interface can feel like a high-end consumer product.
