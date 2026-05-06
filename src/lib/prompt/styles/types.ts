export type ResponseStyleId =
  | "normal"
  | "human"
  | "learning"
  | "concise"
  | "explanatory"
  | "formal"
  | "creative";

export interface ResponseStyleOption {
  id: ResponseStyleId;
  label: string;
  description: string;
  instruction: string;
}
