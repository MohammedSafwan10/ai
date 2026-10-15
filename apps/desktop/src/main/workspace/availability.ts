import fs from "node:fs";

export const assertWorkspaceDirectory = (root: string) => {
  try {
    if (!fs.statSync(root).isDirectory()) throw new Error("Not a directory");
    fs.accessSync(root, fs.constants.R_OK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reason = code === "EACCES" || code === "EPERM" ? "cannot be accessed" : "is missing or is not an accessible directory";
    throw new Error(`Workspace folder ${reason}: ${root}. Restore the folder or select an existing project folder before continuing. No command was started; this is not evidence that Git or ripgrep is missing.`);
  }
};
