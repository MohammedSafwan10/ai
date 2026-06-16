import fs from "node:fs";
import fsp from "node:fs/promises";

const tempPathFor = (targetPath: string) => `${targetPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

export const atomicWriteFileSync = (targetPath: string, content: string | NodeJS.ArrayBufferView, options?: BufferEncoding | fs.WriteFileOptions) => {
  const tempPath = tempPathFor(targetPath);
  fs.writeFileSync(tempPath, content, options as fs.WriteFileOptions | undefined);
  fs.renameSync(tempPath, targetPath);
};

export const atomicWriteFile = async (targetPath: string, content: string | Uint8Array, options?: BufferEncoding | fs.WriteFileOptions) => {
  const tempPath = tempPathFor(targetPath);
  try {
    await fsp.writeFile(tempPath, content, options as fs.WriteFileOptions | undefined);
    await fsp.rename(tempPath, targetPath);
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
};

export const atomicWriteFileNoOverwrite = async (targetPath: string, content: string | Uint8Array, options?: BufferEncoding | fs.WriteFileOptions) => {
  const tempPath = tempPathFor(targetPath);
  try {
    await fsp.writeFile(tempPath, content, options as fs.WriteFileOptions | undefined);
    await fsp.link(tempPath, targetPath);
  } finally {
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
  }
};
