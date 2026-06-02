import { conciseStyle } from "./concise";
import { creativeStyle } from "./creative";
import { explanatoryStyle } from "./explanatory";
import { formalStyle } from "./formal";
import { humanStyle } from "./human";
import { learningStyle } from "./learning";
import { normalStyle } from "./normal";
import type { ResponseStyleOption, ResponseStyleId } from "./types";

export type { ResponseStyleId, ResponseStyleOption } from "./types";

export const DEFAULT_RESPONSE_STYLE_ID: ResponseStyleId = "normal";

export const responseStyleOptions: ResponseStyleOption[] = [
  normalStyle,
  humanStyle,
  learningStyle,
  conciseStyle,
  explanatoryStyle,
  formalStyle,
  creativeStyle,
];

export const getResponseStyle = (styleId: string | undefined) =>
  responseStyleOptions.find((style) => style.id === styleId) ??
  responseStyleOptions.find((style) => style.id === DEFAULT_RESPONSE_STYLE_ID)!;
