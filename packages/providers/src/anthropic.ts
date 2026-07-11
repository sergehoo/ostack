import type { ModelProvider, ModelRequest, ModelResponse } from "@ostack/core";
import { postJson, type FetchLike } from "./http.js";

export interface AnthropicProviderOptions { apiKey?: string; baseUrl?: string; defaultModel?: string; timeoutMs?: number; fetcher?: FetchLike; }

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: AnthropicProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.baseUrl = (options.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
    this.defaultModel = options.defaultModel ?? process.env.OSTACK_ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async isAvailable(): Promise<boolean> { return this.apiKey.length > 0; }
  async complete(request: ModelRequest): Promise<ModelResponse> {
    if (!this.apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
    const body = { model: request.model ?? this.defaultModel, system: request.system, messages: request.messages, max_tokens: request.maxTokens ?? 4096, ...(request.temperature !== undefined ? { temperature: request.temperature } : {}) };
    const data = await postJson<AnthropicResponse>(this.fetcher, this.id, `${this.baseUrl}/messages`, { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" }, body, this.timeoutMs);
    return {
      content: data.content.filter((item) => item.type === "text").map((item) => item.text ?? "").join(""), model: data.model ?? body.model, provider: this.id,
      ...(data.usage ? { usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens } } : {})
    };
  }
}

interface AnthropicResponse { model?: string; content: Array<{ type: string; text?: string }>; usage?: { input_tokens: number; output_tokens: number }; }
