import type { ModelProvider, ModelRequest, ModelResponse } from "@ostack/core";
import { postJson, reachable, type FetchLike } from "./http.js";

export interface OllamaProviderOptions { baseUrl?: string; defaultModel?: string; timeoutMs?: number; fetcher?: FetchLike; }

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    this.defaultModel = options.defaultModel ?? process.env.OSTACK_OLLAMA_MODEL ?? "qwen3";
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async isAvailable(): Promise<boolean> { return reachable(this.fetcher, `${this.baseUrl}/api/tags`); }
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const body = {
      model: request.model ?? this.defaultModel,
      stream: false,
      messages: [{ role: "system", content: request.system }, ...request.messages],
      options: { ...(request.temperature !== undefined ? { temperature: request.temperature } : {}), ...(request.maxTokens ? { num_predict: request.maxTokens } : {}) }
    };
    const data = await postJson<OllamaResponse>(
      this.fetcher, this.id, `${this.baseUrl}/api/chat`, {}, body, this.timeoutMs, request.signal
    );
    return {
      content: data.message.content, model: data.model ?? body.model, provider: this.id,
      ...((data.prompt_eval_count !== undefined || data.eval_count !== undefined) ? { usage: { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 } } : {})
    };
  }
}

interface OllamaResponse { model?: string; message: { role: string; content: string }; prompt_eval_count?: number; eval_count?: number; }
