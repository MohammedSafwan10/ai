import { Account, Client, Databases, ID } from "appwrite";

export const appwriteConfig = {
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT || "",
  projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID || "",
  databaseId: import.meta.env.VITE_APPWRITE_SAAS_DATABASE_ID || "privora_saas",
};

export const isAppwriteConfigured = Boolean(appwriteConfig.endpoint && appwriteConfig.projectId);

export const appwriteClient = new Client();

if (appwriteConfig.endpoint) {
  appwriteClient.setEndpoint(appwriteConfig.endpoint);
}

if (appwriteConfig.projectId) {
  appwriteClient.setProject(appwriteConfig.projectId);
}

export const account = new Account(appwriteClient);
export const databases = new Databases(appwriteClient);
export { ID };
