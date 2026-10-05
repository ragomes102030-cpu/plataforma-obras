export type ArquimedesLlmRequest = {
  system: string;
  user: string;
};

export interface ArquimedesLlmProvider {
  complete(request: ArquimedesLlmRequest): Promise<string>;
}
