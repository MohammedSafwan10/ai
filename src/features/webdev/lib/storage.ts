import {
  createId,
  db,
  type WebDevFileRecord,
  type WebDevMessageRecord,
  type WebDevProjectRecord,
} from "../../../lib/db";
import { getWebDevFileId, normalizeWebDevPath } from "./files";

export const loadWebDevProjects = async () =>
  db.webDevProjects.orderBy("updatedAt").reverse().toArray()
    .then(projects => projects.sort((a, b) => Number(Boolean(b.isStarred)) - Number(Boolean(a.isStarred)) || b.updatedAt - a.updatedAt));

export const loadWebDevFiles = async (projectId: string) =>
  db.webDevFiles.where("projectId").equals(projectId).sortBy("path");

export const loadWebDevMessages = async (projectId: string) =>
  db.webDevMessages.where("projectId").equals(projectId).sortBy("createdAt");

export const createWebDevProject = async (title = "New web app", selectedModel?: string) => {
  const now = Date.now();
  const project: WebDevProjectRecord = {
    id: createId("webdev"),
    title,
    selectedModel,
    status: "idle",
    createdAt: now,
    updatedAt: now,
  };
  const files: WebDevFileRecord[] = [];

  const message: WebDevMessageRecord = {
    id: createId("webdev_msg"),
    projectId: project.id,
    role: "assistant",
    content: "Tell me what to build. I’ll create the project files from scratch.",
    createdAt: now + 1,
  };

  await db.transaction("rw", db.webDevProjects, db.webDevFiles, db.webDevMessages, async () => {
    await db.webDevProjects.put(project);
    await db.webDevFiles.bulkPut(files);
    await db.webDevMessages.put(message);
  });

  return { project, files, messages: [message] };
};

export const updateWebDevProject = async (projectId: string, patch: Partial<WebDevProjectRecord>) => {
  await db.webDevProjects.update(projectId, {
    ...patch,
    updatedAt: patch.updatedAt || Date.now(),
  });
};

export const upsertWebDevFile = async (
  projectId: string,
  file: Pick<WebDevFileRecord, "path" | "content"> & Partial<Pick<WebDevFileRecord, "status" | "summary">>
) => {
  const now = Date.now();
  const path = normalizeWebDevPath(file.path);
  const existing = await db.webDevFiles.get(getWebDevFileId(projectId, path));
  const record: WebDevFileRecord = {
    id: getWebDevFileId(projectId, path),
    projectId,
    path,
    content: file.content,
    status: file.status || (existing ? "updated" : "created"),
    summary: file.summary,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await db.webDevFiles.put(record);
  await updateWebDevProject(projectId, { activeFilePath: path });
  return record;
};

export const deleteWebDevPath = async (projectId: string, path: string) => {
  const normalized = normalizeWebDevPath(path);
  const files = await db.webDevFiles.where("projectId").equals(projectId).toArray();
  const targets = files.filter(file => file.path === normalized || file.path.startsWith(`${normalized}/`));
  await db.webDevFiles.bulkDelete(targets.map(file => file.id));
  await updateWebDevProject(projectId, {});
  return targets;
};

export const renameWebDevPath = async (projectId: string, from: string, to: string) => {
  const fromPath = normalizeWebDevPath(from);
  const toPath = normalizeWebDevPath(to);
  const files = await db.webDevFiles.where("projectId").equals(projectId).toArray();
  const targets = files.filter(file => file.path === fromPath || file.path.startsWith(`${fromPath}/`));
  const renamed = targets.map(file => {
    const nextPath = file.path === fromPath ? toPath : `${toPath}/${file.path.slice(fromPath.length + 1)}`;
    return {
      ...file,
      id: getWebDevFileId(projectId, nextPath),
      path: nextPath,
      status: "updated" as const,
      updatedAt: Date.now(),
    };
  });
  await db.transaction("rw", db.webDevFiles, db.webDevProjects, async () => {
    await db.webDevFiles.bulkDelete(targets.map(file => file.id));
    if (renamed.length > 0) await db.webDevFiles.bulkPut(renamed);
    await db.webDevProjects.update(projectId, { activeFilePath: renamed[0]?.path || toPath, updatedAt: Date.now() });
  });
  return renamed;
};

export const replaceWebDevProjectFiles = async (
  projectId: string,
  files: Array<Pick<WebDevFileRecord, "path" | "content">>
) => {
  const now = Date.now();
  const records: WebDevFileRecord[] = files.map((file, index) => {
    const path = normalizeWebDevPath(file.path);
    return {
      id: getWebDevFileId(projectId, path),
      projectId,
      path,
      content: file.content,
      status: "ready",
      createdAt: now + index,
      updatedAt: now + index,
    };
  });
  await db.transaction("rw", db.webDevFiles, db.webDevProjects, async () => {
    await db.webDevFiles.where("projectId").equals(projectId).delete();
    if (records.length > 0) await db.webDevFiles.bulkPut(records);
    await db.webDevProjects.update(projectId, {
      activeFilePath: records.find(file => file.path === "src/App.tsx")?.path || records[0]?.path,
      updatedAt: Date.now(),
    });
  });
  return records;
};

export const appendWebDevMessage = async (
  projectId: string,
  role: WebDevMessageRecord["role"],
  content: string,
  extra: Partial<Omit<WebDevMessageRecord, "id" | "projectId" | "role" | "content" | "createdAt">> = {}
) => {
  const message: WebDevMessageRecord = {
    id: createId("webdev_msg"),
    projectId,
    role,
    content,
    ...extra,
    createdAt: Date.now(),
  };
  await db.webDevMessages.put(message);
  await updateWebDevProject(projectId, {});
  return message;
};

export const updateWebDevMessage = async (messageId: string, patch: Partial<WebDevMessageRecord>) => {
  await db.webDevMessages.update(messageId, patch);
};

export const deleteWebDevProject = async (projectId: string) => {
  await db.transaction("rw", db.webDevProjects, db.webDevFiles, db.webDevMessages, async () => {
    await db.webDevMessages.where("projectId").equals(projectId).delete();
    await db.webDevFiles.where("projectId").equals(projectId).delete();
    await db.webDevProjects.delete(projectId);
  });
};
