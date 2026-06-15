import { streamProviderResponse } from "../providers";

export type ModelSamplingRequest = Parameters<typeof streamProviderResponse>[0];

export class ModelLoop {
  stream(request: ModelSamplingRequest) {
    return streamProviderResponse(request);
  }
}
