import type { FileSystemTree } from "@webcontainer/api";
import type { WebDevFile } from "./types";

export const normalizeWebDevPath = (path: string) =>
  path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();

export const isSafeWebDevPath = (path: string) => {
  const normalized = normalizeWebDevPath(path);
  return Boolean(normalized) && !normalized.startsWith(".") && !normalized.includes("../") && !/^[a-zA-Z]:/.test(normalized);
};

export const getWebDevFileId = (projectId: string, path: string) =>
  `${projectId}::${normalizeWebDevPath(path)}`;

export const getLanguageForWebDevPath = (path: string) => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".svg")) return "xml";
  return "plaintext";
};

export const defaultWebDevFiles = () => [
  {
    path: "package.json",
    content: JSON.stringify({
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview --host 0.0.0.0",
      },
      dependencies: {
        "@vitejs/plugin-react": "^5.0.4",
        vite: "^6.2.0",
        typescript: "~5.8.2",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        "lucide-react": "^0.546.0",
      },
      devDependencies: {},
    }, null, 2),
  },
  {
    path: "vite.config.ts",
    content: 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});\n',
  },
  {
    path: "index.html",
    content: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Web App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n',
  },
  {
    path: "src/main.tsx",
    content: 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\n\ncreateRoot(document.getElementById("root")!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n',
  },
  {
    path: "src/App.tsx",
    content: 'export default function App() {\n  return null;\n}\n',
  },
  {
    path: "src/index.css",
    content: '* {\n  box-sizing: border-box;\n}\n\nhtml,\nbody,\n#root {\n  min-height: 100%;\n}\n\nbody {\n  margin: 0;\n}\n\nbutton,\ninput,\ntextarea,\nselect {\n  font: inherit;\n}\n',
  },
];

export const toWebContainerTree = (files: WebDevFile[]): FileSystemTree => {
  const root: FileSystemTree = {};

  for (const file of files.filter(item => item.status !== "deleted")) {
    const pathParts = normalizeWebDevPath(file.path).split("/").filter(Boolean);
    let cursor = root;
    pathParts.forEach((part, index) => {
      const isFile = index === pathParts.length - 1;
      if (isFile) {
        cursor[part] = { file: { contents: file.content } };
        return;
      }
      const existing = cursor[part];
      if (!existing || !("directory" in existing)) {
        cursor[part] = { directory: {} };
      }
      cursor = (cursor[part] as { directory: FileSystemTree }).directory;
    });
  }

  return root;
};

export const getPackageHash = (files: WebDevFile[]) =>
  files.find(file => normalizeWebDevPath(file.path) === "package.json")?.content || "";
