import type { ModelProvider, ModelRequest, ModelResponse } from "@ostack/core";
import { postJson, type FetchLike } from "./http.js";

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
}

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.defaultModel = options.defaultModel ?? process.env.OSTACK_OPENAI_MODEL ?? "gpt-5.4-mini";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async isAvailable(): Promise<boolean> { return this.apiKey.length > 0; }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not configured");
    const body = {
      model: request.model ?? this.defaultModel,
      instructions: request.system,
      input: request.messages.map((message) => ({ role: message.role, content: message.content })),
      ...(request.maxTokens ? { max_output_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {})
    };
    const data = await postJson<OpenAIResponse>(this.fetcher, this.id, `${this.baseUrl}/responses`, { authorization: `Bearer ${this.apiKey}` }, body, this.timeoutMs);
    const content = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("") ?? "";
    return {
      content, model: data.model ?? body.model, provider: this.id,
      ...(data.usage ? { usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens } } : {})
    };
  }
}

interface OpenAIResponse {
  model?: string; output_text?: string;
  output?: Array<{ content?: Array<{ type: string; text?: string }> }>;
  usage?: { input_tokens: number; output_tokens: number };
}
