type LogFields = Record<string, unknown>;

const isDev = Boolean((import.meta as any).env?.DEV);

const write = (level: "debug" | "info" | "warn" | "error", message: string, fields?: LogFields) => {
  if (!isDev && level !== "error") return;

  const payload = {
    scope: "privora:web",
    message,
    ...fields,
  };

  if (level === "debug") console.debug(payload);
  if (level === "info") console.info(payload);
  if (level === "warn") console.warn(payload);
  if (level === "error") console.error(payload);
};

export const appLogger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};
